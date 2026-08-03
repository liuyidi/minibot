"""Minimal ReAct-style agent runner (LLM <-> tools loop)."""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from minibot.agent.tools.registry import ToolRegistry
from minibot.observability import langfuse as lf
from minibot.providers.base import (
    LLMProvider,
    LLMResponse,
    ReasoningDelta,
    StreamEnd,
    TextDelta,
    UsageEnd,
)
from minibot.providers.fallback import FallbackProvider

_PREVIEW_LIMIT = 800


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_ms() -> int:
    """Wall-clock epoch milliseconds for trace ``t_start`` / ``t_end``."""
    return int(time.time() * 1000)


def _preview(value: Any, limit: int = _PREVIEW_LIMIT) -> Any:
    if isinstance(value, str):
        if len(value) <= limit:
            return value
        return value[:limit] + f"…(+{len(value) - limit} chars)"
    if isinstance(value, dict):
        return {k: _preview(v, limit) for k, v in value.items()}
    if isinstance(value, list):
        if len(value) > 24:
            head = [_preview(v, limit) for v in value[:24]]
            head.append(f"…(+{len(value) - 24} items)")
            return head
        return [_preview(v, limit) for v in value]
    return value


def _messages_snapshot(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compact view of the prompt assembly sent to the LLM."""
    out: list[dict[str, Any]] = []
    for msg in messages:
        item: dict[str, Any] = {"role": msg.get("role")}
        if "name" in msg:
            item["name"] = msg.get("name")
        if "tool_call_id" in msg:
            item["tool_call_id"] = msg.get("tool_call_id")
        content = msg.get("content")
        if content is not None:
            item["content"] = _preview(content)
        tool_calls = msg.get("tool_calls")
        if tool_calls:
            item["tool_calls"] = _preview(tool_calls)
        out.append(item)
    return out


def _close_step(step: dict[str, Any], perf0: float, *, t_start_ms: int | None = None) -> dict[str, Any]:
    """Attach ``t_end`` / ``duration_ms``; ensure ``t_start`` is set."""
    if "t_start" not in step:
        step["t_start"] = t_start_ms if t_start_ms is not None else _now_ms()
    step["t_end"] = _now_ms()
    step["duration_ms"] = round((time.perf_counter() - perf0) * 1000, 1)
    return step


@dataclass(slots=True)
class AgentRunResult:
    content: str
    messages: list[dict[str, Any]]
    tools_used: list[str] = field(default_factory=list)
    stop_reason: str = "completed"
    trace: list[dict[str, Any]] = field(default_factory=list)
    langfuse_trace_id: str = ""
    reasoning: str = ""
    aborted: bool = False
    used_provider: str = ""
    used_preset: str = ""
    approval_id: str = ""
    pending_tool_calls: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class RunnerEvent:
    """Events emitted by ``run_stream`` for Loop/Bus fan-out."""

    kind: str
    text: str = ""
    stream_id: str = ""
    name: str = ""
    detail: str = ""
    data: dict[str, Any] = field(default_factory=dict)


class AgentRunner:
    def __init__(self, provider: LLMProvider) -> None:
        self.provider = provider

    async def run(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: ToolRegistry,
        model: str,
        max_iterations: int = 8,
        temperature: float | None = 0.2,
        system: str | None = None,
        context_meta: dict[str, Any] | None = None,
        prompt_version_id: str | None = None,
        should_abort: Any | None = None,
    ) -> AgentRunResult:
        result: AgentRunResult | None = None
        async for ev in self.run_stream(
            messages=messages,
            tools=tools,
            model=model,
            max_iterations=max_iterations,
            temperature=temperature,
            system=system,
            context_meta=context_meta,
            prompt_version_id=prompt_version_id,
            should_abort=should_abort,
        ):
            if ev.kind == "done":
                result = ev.data.get("result")
        if result is None:
            return AgentRunResult(content="(empty)", messages=list(messages), stop_reason="error")
        return result

    async def run_stream(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: ToolRegistry,
        model: str,
        max_iterations: int = 8,
        temperature: float | None = 0.2,
        system: str | None = None,
        context_meta: dict[str, Any] | None = None,
        prompt_version_id: str | None = None,
        should_abort: Any | None = None,
    ) -> AsyncIterator[RunnerEvent]:
        """ReAct loop with streaming LLM rounds.

        ``should_abort`` is an optional zero-arg callable returning bool.
        """
        working = list(messages)
        if system and (not working or working[0].get("role") != "system"):
            working.insert(0, {"role": "system", "content": system})

        tools_used: list[str] = []
        definitions = tools.get_definitions()
        trace: list[dict[str, Any]] = []
        last_reasoning = ""
        used_provider = ""
        used_preset = ""

        def aborted() -> bool:
            return bool(should_abort and should_abort())

        def flush_switches() -> list[RunnerEvent]:
            nonlocal used_provider, used_preset
            events: list[RunnerEvent] = []
            if isinstance(self.provider, FallbackProvider):
                for entry in self.provider.drain_switches():
                    events.append(RunnerEvent(kind="provider_switched", data=entry))
                meta = self.provider.used_meta()
                used_provider = str(meta.get("used_provider") or used_provider)
                used_preset = str(meta.get("used_preset") or used_preset)
            else:
                used_provider = type(self.provider).__name__
            return events

        def attach_used(result: AgentRunResult) -> AgentRunResult:
            result.used_provider = used_provider
            result.used_preset = used_preset
            return result

        prep_t0 = time.perf_counter()
        prepare: dict[str, Any] = {
            "type": "prepare",
            "t_start": _now_ms(),
            "model": model,
            "temperature": temperature,
            "max_iterations": max_iterations,
            "message_count": len(working),
            "tool_names": tools.names(),
            "system_injected": bool(system),
            "messages": _messages_snapshot(working),
        }
        if isinstance(self.provider, FallbackProvider):
            prepare["fallback_chain"] = [s.id for s in self.provider.slots]
        if context_meta:
            prepare["context"] = context_meta
        trace.append(_close_step(prepare, prep_t0))

        for iteration in range(1, max_iterations + 1):
            if aborted():
                content = "(aborted)"
                working.append({"role": "assistant", "content": content})
                result = attach_used(
                    AgentRunResult(
                        content=content,
                        messages=working,
                        tools_used=tools_used,
                        stop_reason="aborted",
                        trace=trace,
                        reasoning=last_reasoning,
                        aborted=True,
                    )
                )
                yield RunnerEvent(kind="done", data={"result": result})
                return

            request_ts = _now_iso()
            request_t0 = time.perf_counter()
            request_t_start = _now_ms()
            stream_id = f"s{iteration}"
            reasoning_id = f"r{iteration}"
            req_step: dict[str, Any] = {
                "type": "llm_request",
                "t_start": request_t_start,
                "iteration": iteration,
                "model": model,
                "message_count": len(working),
                "tools_offered": [d.get("function", {}).get("name") for d in definitions]
                if definitions
                else [],
                "messages": _messages_snapshot(working),
                "ts": request_ts,
            }
            if context_meta:
                req_step["context"] = context_meta
            trace.append(_close_step(req_step, request_t0, t_start_ms=request_t_start))

            content_parts: list[str] = []
            reasoning_parts: list[str] = []
            response: LLMResponse | None = None
            saw_reasoning = False

            with lf.observation(
                as_type="generation",
                name=f"llm:{iteration}",
                model=model,
                input={"messages": _messages_snapshot(working)},
                metadata={"iteration": iteration, "stream": True},
                model_parameters={"temperature": temperature},
                prompt_version_id=prompt_version_id,
            ) as gen:
                async for ev in self.provider.chat_stream(
                    working,
                    tools=definitions or None,
                    model=model,
                    temperature=temperature,
                ):
                    for sw in flush_switches():
                        yield sw
                    if aborted():
                        gen.update(output={"aborted": True}, status="ERROR", status_message="aborted")
                        content = "".join(content_parts) or "(aborted)"
                        working.append({"role": "assistant", "content": content})
                        result = attach_used(
                            AgentRunResult(
                                content=content,
                                messages=working,
                                tools_used=tools_used,
                                stop_reason="aborted",
                                trace=trace,
                                reasoning="".join(reasoning_parts),
                                aborted=True,
                            )
                        )
                        yield RunnerEvent(kind="stream_aborted", stream_id=stream_id)
                        yield RunnerEvent(kind="done", data={"result": result})
                        return

                    if isinstance(ev, ReasoningDelta):
                        saw_reasoning = True
                        reasoning_parts.append(ev.text)
                        yield RunnerEvent(
                            kind="reasoning_delta",
                            text=ev.text,
                            stream_id=reasoning_id,
                        )
                    elif isinstance(ev, TextDelta):
                        content_parts.append(ev.text)
                        yield RunnerEvent(kind="delta", text=ev.text, stream_id=stream_id)
                    elif isinstance(ev, UsageEnd):
                        pass
                    elif isinstance(ev, StreamEnd):
                        response = LLMResponse(
                            content=ev.content if ev.content is not None else "".join(content_parts),
                            tool_calls=list(ev.tool_calls),
                            finish_reason=ev.finish_reason,
                            usage=ev.usage,
                            reasoning=ev.reasoning or ("".join(reasoning_parts) or None),
                        )

                response_ts = _now_iso()
                duration_ms = round((time.perf_counter() - request_t0) * 1000, 1)
                response_t_end = _now_ms()
                if response is None:
                    response = LLMResponse(
                        content="".join(content_parts) or "Model error",
                        finish_reason="error",
                    )

                if saw_reasoning:
                    yield RunnerEvent(kind="reasoning_end", stream_id=reasoning_id)
                yield RunnerEvent(kind="stream_end", stream_id=stream_id)
                for sw in flush_switches():
                    yield sw

                usage = response.usage
                last_reasoning = response.reasoning or "".join(reasoning_parts)
                if used_provider:
                    # annotate the preceding llm_request with actual provider used
                    for step in reversed(trace):
                        if step.get("type") == "llm_request" and step.get("iteration") == iteration:
                            step["used_provider"] = used_provider
                            step["used_preset"] = used_preset
                            break
                if response.finish_reason == "error":
                    gen.update(
                        output={"error": _preview(response.content)},
                        usage=lf.usage_dict(usage),
                        status="ERROR",
                        status_message=response.content or "Model error",
                    )
                elif response.tool_calls:
                    gen.update(
                        output={
                            "content": _preview(response.content),
                            "tool_calls": [
                                {"id": tc.id, "name": tc.name, "arguments": _preview(tc.arguments)}
                                for tc in response.tool_calls
                            ],
                        },
                        usage=lf.usage_dict(usage),
                    )
                else:
                    gen.update(
                        output={"content": _preview(response.content)},
                        usage=lf.usage_dict(usage),
                    )

            if response.finish_reason == "error":
                content = response.content or "Model error"
                working.append({"role": "assistant", "content": content})
                err_step: dict[str, Any] = {
                    "type": "llm_error",
                    "t_start": request_t_start,
                    "t_end": response_t_end,
                    "duration_ms": duration_ms,
                    "iteration": iteration,
                    "finish_reason": response.finish_reason,
                    "content": _preview(content),
                    "ts": response_ts,
                    "request_ts": request_ts,
                    "usage": usage,
                    "used_provider": used_provider,
                    "used_preset": used_preset,
                }
                trace.append(err_step)
                done = {
                    "type": "done",
                    "t_start": _now_ms(),
                    "stop_reason": "error",
                    "content": _preview(content),
                    "used_provider": used_provider,
                    "used_preset": used_preset,
                }
                trace.append(_close_step(done, time.perf_counter()))
                result = attach_used(
                    AgentRunResult(
                        content=content,
                        messages=working,
                        tools_used=tools_used,
                        stop_reason="error",
                        trace=trace,
                        reasoning=last_reasoning,
                    )
                )
                yield RunnerEvent(kind="done", data={"result": result})
                return

            if response.tool_calls:
                assistant: dict[str, Any] = {
                    "role": "assistant",
                    "content": response.content or None,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                            },
                        }
                        for tc in response.tool_calls
                    ],
                }
                working.append(assistant)
                trace.append(
                    {
                        "type": "llm_tool_calls",
                        "t_start": request_t_start,
                        "t_end": response_t_end,
                        "duration_ms": duration_ms,
                        "iteration": iteration,
                        "assistant_content": _preview(response.content),
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "name": tc.name,
                                "arguments": _preview(tc.arguments),
                            }
                            for tc in response.tool_calls
                        ],
                        "working_appended": _messages_snapshot([assistant])[0],
                        "ts": response_ts,
                        "request_ts": request_ts,
                        "usage": usage,
                    }
                )
                approvals: list[dict[str, Any]] = []
                all_calls = [
                    {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                    for tc in response.tool_calls
                ]
                approval_reason = ""
                approval_risk = "unknown"
                for tc in response.tool_calls:
                    required, reason, risk = tools.approval_required(tc.name, tc.arguments)
                    if required:
                        approvals.append({"id": tc.id, "name": tc.name, "arguments": tc.arguments})
                        approval_reason = approval_reason or reason
                        approval_risk = risk if risk in {"critical", "high"} else approval_risk
                if approvals:
                    trace.append(
                        {
                            "type": "approval_required",
                            "t_start": _now_ms(),
                            "tool_calls": _preview(approvals),
                            "reason": approval_reason,
                            "risk": approval_risk,
                        }
                    )
                    yield RunnerEvent(
                        kind="approval_required",
                        data={
                            "tool_calls": all_calls,
                            "reason": approval_reason,
                            "risk": approval_risk,
                        },
                    )
                    result = attach_used(
                        AgentRunResult(
                            content="",
                            messages=working,
                            tools_used=tools_used,
                            stop_reason="paused_for_approval",
                            trace=trace,
                            reasoning=last_reasoning,
                            pending_tool_calls=all_calls,
                        )
                    )
                    yield RunnerEvent(kind="done", data={"result": result})
                    return
                for tc in response.tool_calls:
                    yield RunnerEvent(
                        kind="tool_call_start",
                        name=tc.name,
                        detail=json.dumps(tc.arguments, ensure_ascii=False)[:200],
                        data={"id": tc.id, "arguments": tc.arguments},
                    )
                    tool_t0 = time.perf_counter()
                    tool_t_start = _now_ms()
                    with lf.observation(
                        as_type="span",
                        name=f"tool:{tc.name}",
                        input={"arguments": _preview(tc.arguments)},
                        metadata={"tool_call_id": tc.id, "iteration": iteration},
                    ) as tool_span:
                        result_text = await tools.execute(tc.name, tc.arguments)
                        tool_span.update(output={"result": _preview(result_text)})
                    tools_used.append(tc.name)
                    tool_msg = {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tc.name,
                        "content": result_text,
                    }
                    working.append(tool_msg)
                    tool_step = {
                        "type": "tool_result",
                        "t_start": tool_t_start,
                        "iteration": iteration,
                        "tool_call_id": tc.id,
                        "name": tc.name,
                        "arguments": _preview(tc.arguments),
                        "result": _preview(result_text),
                        "working_appended": _messages_snapshot([tool_msg])[0],
                    }
                    trace.append(_close_step(tool_step, tool_t0, t_start_ms=tool_t_start))
                    yield RunnerEvent(
                        kind="tool_result",
                        name=tc.name,
                        text=_preview(result_text) if isinstance(result_text, str) else str(_preview(result_text)),
                        data={"id": tc.id},
                    )
                    if aborted():
                        content = "(aborted)"
                        working.append({"role": "assistant", "content": content})
                        result = attach_used(
                            AgentRunResult(
                                content=content,
                                messages=working,
                                tools_used=tools_used,
                                stop_reason="aborted",
                                trace=trace,
                                reasoning=last_reasoning,
                                aborted=True,
                            )
                        )
                        yield RunnerEvent(kind="done", data={"result": result})
                        return
                continue

            content = (response.content or "").strip() or "(empty response)"
            working.append({"role": "assistant", "content": content})
            trace.append(
                {
                    "type": "llm_final",
                    "t_start": request_t_start,
                    "t_end": response_t_end,
                    "duration_ms": duration_ms,
                    "iteration": iteration,
                    "finish_reason": response.finish_reason,
                    "content": _preview(content),
                    "ts": response_ts,
                    "request_ts": request_ts,
                    "usage": usage,
                    "reasoning": _preview(last_reasoning) if last_reasoning else None,
                }
            )
            done = {
                "type": "done",
                "t_start": _now_ms(),
                "stop_reason": "completed",
                "iterations_used": iteration,
                "tools_used": list(tools_used),
                "content": _preview(content),
                "final_messages": _messages_snapshot(working),
                "used_provider": used_provider,
                "used_preset": used_preset,
            }
            trace.append(_close_step(done, time.perf_counter()))
            result = attach_used(
                AgentRunResult(
                    content=content,
                    messages=working,
                    tools_used=tools_used,
                    stop_reason="completed",
                    trace=trace,
                    reasoning=last_reasoning,
                )
            )
            yield RunnerEvent(kind="done", data={"result": result})
            return

        content = f"Stopped after {max_iterations} tool iterations."
        working.append({"role": "assistant", "content": content})
        done = {
            "type": "done",
            "t_start": _now_ms(),
            "stop_reason": "max_iterations",
            "iterations_used": max_iterations,
            "tools_used": list(tools_used),
            "content": _preview(content),
            "final_messages": _messages_snapshot(working),
            "used_provider": used_provider,
            "used_preset": used_preset,
        }
        trace.append(_close_step(done, time.perf_counter()))
        result = attach_used(
            AgentRunResult(
                content=content,
                messages=working,
                tools_used=tools_used,
                stop_reason="max_iterations",
                trace=trace,
                reasoning=last_reasoning,
            )
        )
        yield RunnerEvent(kind="done", data={"result": result})


def new_chat_id() -> str:
    return uuid.uuid4().hex[:12]
