"""Anthropic Messages API provider (httpx, no SDK dependency).

Converts OpenAI-style chat messages/tools used by AgentRunner into Anthropic's
Messages format. Pattern mirrors minibot's AnthropicProvider and CrewAI's
native Anthropic completion, kept lean for minibot.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from minibot.providers.base import (
    LLMProvider,
    LLMResponse,
    ReasoningDelta,
    StreamEnd,
    StreamEvent,
    TextDelta,
    ToolCallRequest,
    UsageEnd,
)
from minibot.providers.http_client import llm_httpx_trust_env

_ANTHROPIC_VERSION = "2023-06-01"


def _normalize_base_url(api_base: str) -> str:
    """Return origin used as ``{base}/v1/messages``."""
    base = (api_base or "https://api.anthropic.com").rstrip("/")
    if base.endswith("/v1"):
        base = base[: -len("/v1")]
    return base


def _strip_model_prefix(model: str) -> str:
    if model.startswith("anthropic/"):
        return model[len("anthropic/") :]
    return model


def _parse_args(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"_raw": raw}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def openai_tools_to_anthropic(tools: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Map OpenAI function tools → Anthropic tools list."""
    out: list[dict[str, Any]] = []
    for tool in tools or []:
        if not isinstance(tool, dict):
            continue
        fn = tool.get("function") if tool.get("type") == "function" else tool
        if not isinstance(fn, dict):
            continue
        name = str(fn.get("name") or "").strip()
        if not name:
            continue
        params = fn.get("parameters") if isinstance(fn.get("parameters"), dict) else {"type": "object", "properties": {}}
        out.append(
            {
                "name": name,
                "description": str(fn.get("description") or ""),
                "input_schema": params,
            }
        )
    return out


def convert_messages(
    messages: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]]]:
    """OpenAI chat messages → ``(system, anthropic_messages)``."""
    system_parts: list[str] = []
    raw: list[dict[str, Any]] = []

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content")

        if role == "system":
            if isinstance(content, str) and content:
                system_parts.append(content)
            elif content is not None:
                system_parts.append(str(content))
            continue

        if role == "tool":
            block = {
                "type": "tool_result",
                "tool_use_id": str(msg.get("tool_call_id") or ""),
                "content": content if isinstance(content, str) else str(content or ""),
            }
            if raw and raw[-1]["role"] == "user" and isinstance(raw[-1]["content"], list):
                raw[-1]["content"].append(block)
            else:
                raw.append({"role": "user", "content": [block]})
            continue

        if role == "assistant":
            blocks: list[dict[str, Any]] = []
            if isinstance(content, str) and content:
                blocks.append({"type": "text", "text": content})
            for tc in msg.get("tool_calls") or []:
                if not isinstance(tc, dict):
                    continue
                fn = tc.get("function") or {}
                blocks.append(
                    {
                        "type": "tool_use",
                        "id": str(tc.get("id") or f"toolu_{len(blocks)}"),
                        "name": str(fn.get("name") or ""),
                        "input": _parse_args(fn.get("arguments")),
                    }
                )
            raw.append({"role": "assistant", "content": blocks or [{"type": "text", "text": ""}]})
            continue

        if role == "user":
            if isinstance(content, list):
                text = "\n".join(
                    str(b.get("text") if isinstance(b, dict) else b) for b in content
                )
            else:
                text = content if isinstance(content, str) else str(content or "")
            raw.append({"role": "user", "content": text or "(empty)"})

    merged = _merge_consecutive(raw)
    return "\n\n".join(system_parts), merged


def _merge_consecutive(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not messages:
        return [{"role": "user", "content": "(empty)"}]
    out: list[dict[str, Any]] = []
    for msg in messages:
        if out and out[-1]["role"] == msg["role"]:
            prev = out[-1]["content"]
            cur = msg["content"]
            if isinstance(prev, list) and isinstance(cur, list):
                out[-1]["content"] = [*prev, *cur]
            elif isinstance(prev, str) and isinstance(cur, str):
                out[-1]["content"] = f"{prev}\n{cur}"
            else:
                out.append(msg)
        else:
            out.append(msg)
    # Anthropic requires first message to be user
    if out and out[0]["role"] != "user":
        out.insert(0, {"role": "user", "content": "(continue)"})
    return out


def _usage_from_anthropic(data: dict[str, Any]) -> dict[str, Any] | None:
    usage = data.get("usage")
    if not isinstance(usage, dict):
        return None
    out: dict[str, Any] = {}
    if usage.get("input_tokens") is not None:
        out["prompt_tokens"] = int(usage["input_tokens"])
    if usage.get("output_tokens") is not None:
        out["completion_tokens"] = int(usage["output_tokens"])
    if out:
        out["total_tokens"] = int(out.get("prompt_tokens", 0)) + int(out.get("completion_tokens", 0))
    return out or None


def _parse_message_content(content: Any) -> tuple[str | None, str | None, list[ToolCallRequest]]:
    text_parts: list[str] = []
    thinking_parts: list[str] = []
    tool_calls: list[ToolCallRequest] = []
    if not isinstance(content, list):
        return (str(content) if content else None), None, []
    for block in content:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            t = block.get("text")
            if isinstance(t, str) and t:
                text_parts.append(t)
        elif btype == "thinking":
            t = block.get("thinking")
            if isinstance(t, str) and t:
                thinking_parts.append(t)
        elif btype == "tool_use":
            tool_calls.append(
                ToolCallRequest(
                    id=str(block.get("id") or f"toolu_{len(tool_calls)}"),
                    name=str(block.get("name") or ""),
                    arguments=block.get("input") if isinstance(block.get("input"), dict) else {},
                )
            )
    return (
        "".join(text_parts) or None,
        "".join(thinking_parts) or None,
        tool_calls,
    )


class AnthropicProvider(LLMProvider):
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.anthropic.com",
        *,
        max_tokens: int = 4096,
    ) -> None:
        self.api_key = api_key
        self.base_url = _normalize_base_url(base_url)
        self.max_tokens = max_tokens

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

    def _url(self) -> str:
        return f"{self.base_url}/v1/messages"

    def _payload(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None,
        model: str,
        temperature: float | None,
        stream: bool,
    ) -> dict[str, Any]:
        system, anth_messages = convert_messages(messages)
        payload: dict[str, Any] = {
            "model": _strip_model_prefix(model),
            "messages": anth_messages,
            "max_tokens": self.max_tokens,
        }
        if system:
            payload["system"] = system
        if temperature is not None:
            payload["temperature"] = temperature
        anth_tools = openai_tools_to_anthropic(tools)
        if anth_tools:
            payload["tools"] = anth_tools
        if stream:
            payload["stream"] = True
        return payload

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> LLMResponse:
        if not self.api_key:
            return LLMResponse(
                content=(
                    "No API key configured for Anthropic. Set ANTHROPIC_API_KEY "
                    "or add an anthropic model preset, then retry."
                ),
                finish_reason="error",
            )

        payload = self._payload(
            messages, tools=tools, model=model, temperature=temperature, stream=False
        )
        async with httpx.AsyncClient(timeout=120.0, trust_env=llm_httpx_trust_env()) as client:
            res = await client.post(self._url(), headers=self._headers(), json=payload)
            if res.status_code >= 400:
                return LLMResponse(
                    content=f"LLM error HTTP {res.status_code}: {res.text[:500]}",
                    finish_reason="error",
                )
            data = res.json()

        content, reasoning, tool_calls = _parse_message_content(data.get("content"))
        stop = data.get("stop_reason") or "end_turn"
        finish = "tool_calls" if stop == "tool_use" or tool_calls else str(stop)
        return LLMResponse(
            content=content,
            tool_calls=tool_calls,
            finish_reason=finish,
            usage=_usage_from_anthropic(data if isinstance(data, dict) else {}),
            reasoning=reasoning,
        )

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> AsyncIterator[StreamEvent]:
        if not self.api_key:
            yield StreamEnd(
                finish_reason="error",
                content=(
                    "No API key configured for Anthropic. Set ANTHROPIC_API_KEY "
                    "or add an anthropic model preset, then retry."
                ),
            )
            return

        payload = self._payload(
            messages, tools=tools, model=model, temperature=temperature, stream=True
        )
        headers = {**self._headers(), "accept": "text/event-stream"}

        content_parts: list[str] = []
        reasoning_parts: list[str] = []
        tool_acc: dict[int, dict[str, Any]] = {}
        current_index = -1
        current_type = ""
        finish_reason = "stop"
        usage: dict[str, Any] | None = None

        async with httpx.AsyncClient(timeout=120.0, trust_env=llm_httpx_trust_env()) as client:
            async with client.stream("POST", self._url(), headers=headers, json=payload) as res:
                if res.status_code >= 400:
                    body = (await res.aread()).decode("utf-8", errors="replace")[:500]
                    yield StreamEnd(
                        finish_reason="error",
                        content=f"LLM error HTTP {res.status_code}: {body}",
                    )
                    return
                async for line in res.aiter_lines():
                    if not line or line.startswith(":"):
                        continue
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].lstrip()
                    if not data_str or data_str.strip() == "[DONE]":
                        continue
                    try:
                        event = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(event, dict):
                        continue
                    etype = event.get("type")

                    if etype == "content_block_start":
                        current_index = int(event.get("index") or 0)
                        block = event.get("content_block") or {}
                        current_type = str(block.get("type") or "")
                        if current_type == "tool_use":
                            tool_acc[current_index] = {
                                "id": str(block.get("id") or f"toolu_{current_index}"),
                                "name": str(block.get("name") or ""),
                                "arguments": "",
                            }
                    elif etype == "content_block_delta":
                        delta = event.get("delta") or {}
                        dtype = delta.get("type")
                        if dtype == "text_delta":
                            text = delta.get("text")
                            if isinstance(text, str) and text:
                                content_parts.append(text)
                                yield TextDelta(text=text)
                        elif dtype == "thinking_delta":
                            text = delta.get("thinking")
                            if isinstance(text, str) and text:
                                reasoning_parts.append(text)
                                yield ReasoningDelta(text=text)
                        elif dtype == "input_json_delta":
                            partial = delta.get("partial_json")
                            if isinstance(partial, str) and current_index in tool_acc:
                                tool_acc[current_index]["arguments"] += partial
                    elif etype == "message_delta":
                        delta = event.get("delta") or {}
                        stop = delta.get("stop_reason")
                        if stop == "tool_use":
                            finish_reason = "tool_calls"
                        elif stop:
                            finish_reason = str(stop)
                        u = event.get("usage")
                        if isinstance(u, dict):
                            usage = _usage_from_anthropic({"usage": u}) or usage
                    elif etype == "message_start":
                        msg = event.get("message") or {}
                        u = msg.get("usage")
                        if isinstance(u, dict):
                            usage = _usage_from_anthropic({"usage": u}) or usage

        tool_calls: list[ToolCallRequest] = []
        for idx in sorted(tool_acc):
            slot = tool_acc[idx]
            tool_calls.append(
                ToolCallRequest(
                    id=slot["id"],
                    name=slot["name"],
                    arguments=_parse_args(slot["arguments"]),
                )
            )
        if tool_calls and finish_reason == "stop":
            finish_reason = "tool_calls"
        if usage:
            yield UsageEnd(usage=usage)
        yield StreamEnd(
            finish_reason=finish_reason,
            content="".join(content_parts) or None,
            tool_calls=tool_calls,
            reasoning="".join(reasoning_parts) or None,
            usage=usage,
        )
