"""AgentLoop — sole turn entrypoint with per-session locks.

Contract: concurrent ``handle_turn`` calls for the **same** ``session_id``
are serialized via ``asyncio.Lock``. Different sessions may run in parallel.

Phase 0.3+: REST / WS / CLI must call ``handle_turn`` only (not ``runner.run``).
"""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

from minibot.agent.approval import ApprovalStore
from minibot.agent.runner import AgentRunResult, AgentRunner, RunnerEvent
from minibot.agent.stream_coalesce import StreamCoalescer
from minibot.agent.tools.registry import ToolRegistry
from minibot.bus.events import OutboundMessage
from minibot.bus.queue import MessageBus
from minibot.config.app_config import AppConfig
from minibot.security.principal_context import current_principal
from minibot.security.workspace_access import bind_workspace, reset_workspace
from minibot.session.store import SessionStore
from minibot.workspace import normalize_workspace

_LAST_TURNS_MAX = 40
_ROLES = {"system", "user", "assistant", "tool"}
_ENTRY_KEYS = (
    "rest",
    "ws",
    "cli",
    "dev",
    "cron",
    "feishu",
    "weixin",
    "heartbeat",
    "dream",
    "unknown",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class _LockSlot:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    held: bool = False
    waiters: int = 0
    last_duration_ms: float | None = None
    last_finished_at: str | None = None
    last_stop_reason: str | None = None
    last_workspace: str | None = None


class AgentLoop:
    def __init__(
        self,
        *,
        sessions: SessionStore,
        tools: ToolRegistry,
        runner: AgentRunner,
        config: AppConfig,
        approvals: ApprovalStore | None = None,
        system_prompt: str = "",
        usage_budget: Any | None = None,
    ) -> None:
        self.sessions = sessions
        self.tools = tools
        self.runner = runner
        self.config = config
        self.approvals = approvals or ApprovalStore(sessions.data_dir)
        self.system_prompt = system_prompt
        self.usage_budget = usage_budget
        self._locks: dict[str, _LockSlot] = {}
        self._last_turns: list[dict[str, Any]] = []
        self._entry_counts: dict[str, int] = {k: 0 for k in _ENTRY_KEYS}
        self._compaction_log: list[dict[str, Any]] = []
        self._last_langfuse_trace_id: dict[str, str] = {}
        self._abort: dict[str, asyncio.Event] = {}

    def request_abort(self, session_id: str) -> bool:
        ev = self._abort.get(session_id)
        if ev is None:
            return False
        ev.set()
        return True

    def _abort_event(self, session_id: str) -> asyncio.Event:
        ev = self._abort.get(session_id)
        if ev is None:
            ev = asyncio.Event()
            self._abort[session_id] = ev
        return ev

    def _chat_model(self) -> str:
        from minibot.config.platform_models import effective_chat_model

        return effective_chat_model(self.config) or self.config.model

    @property
    def compaction_log(self) -> list[dict[str, Any]]:
        return list(self._compaction_log)

    def _slot(self, session_id: str) -> _LockSlot:
        slot = self._locks.get(session_id)
        if slot is None:
            slot = _LockSlot()
            self._locks[session_id] = slot
        return slot

    @asynccontextmanager
    async def session_lock(self, session_id: str) -> AsyncIterator[_LockSlot]:
        """Acquire the per-session lock (same contract as ``handle_turn``)."""
        slot = self._slot(session_id)
        slot.waiters += 1
        try:
            await slot.lock.acquire()
        finally:
            slot.waiters -= 1
        slot.held = True
        try:
            yield slot
        finally:
            slot.held = False
            slot.lock.release()

    async def handle_turn(
        self,
        session_id: str,
        content: str,
        workspace: Path | str | None = None,
        *,
        entry: str = "unknown",
        system: str | None = None,
        model: str | None = None,
        max_iterations: int | None = None,
        temperature: float | None = None,
        stream: bool | None = None,
        bus: MessageBus | None = None,
        channel: str = "websocket",
        media: list[str] | None = None,
    ) -> AgentRunResult:
        """Run one user turn under the session lock.

        Effective workspace = explicit ``workspace`` arg, else session's
        ``workspace_path``. Phase 1+ tools will bind to this path.

        ``entry`` labels the caller (``rest`` / ``ws`` / ``cli`` / ``dev``) for
        Dev UI counters — not used for routing logic.
        """
        entry_key = entry if entry in self._entry_counts else "unknown"
        use_stream = stream if stream is not None else entry_key in {"ws", "cron"}
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"unknown session: {session_id}")

        if self.usage_budget is not None:
            self.usage_budget.check(entry=entry_key)

        if workspace is not None:
            effective_ws = str(normalize_workspace(workspace, must_exist=True))
        else:
            effective_ws = session.workspace_path

        t0 = time.perf_counter()
        ws_token = bind_workspace(effective_ws)
        from minibot.security.session_context import bind_session, reset_session

        session_token = bind_session(session_id)
        parent_token = None
        abort_ev = self._abort_event(session_id)
        abort_ev.clear()
        try:
            from minibot.agent.tools.spawn import bind_parent_session, reset_parent_session
            from minibot.observability import langfuse as lf

            parent_token = bind_parent_session(session_id)
            principal = current_principal()
            with lf.turn_trace(
                name="agent-turn",
                session_id=session_id,
                user_id=(principal.user_id if principal else None),
                input={"content": content},
                metadata={
                    "entry": entry_key,
                    "workspace_path": effective_ws,
                },
                tags=["minibot", entry_key],
            ) as lf_trace:
                async with self.session_lock(session_id) as slot:
                    result = await self._run_unlocked(
                        session_id,
                        content,
                        system=system,
                        model=model,
                        max_iterations=max_iterations,
                        temperature=temperature,
                        stream=use_stream,
                        bus=bus,
                        channel=channel,
                        should_abort=lambda: abort_ev.is_set(),
                        media=media,
                    )
                    slot.last_stop_reason = result.stop_reason
                    slot.last_workspace = effective_ws
                    duration_ms = round((time.perf_counter() - t0) * 1000.0, 2)
                    slot.last_duration_ms = duration_ms
                    slot.last_finished_at = _now_iso()
                    self._entry_counts[entry_key] = self._entry_counts.get(entry_key, 0) + 1
                    if self.usage_budget is not None:
                        from minibot.observability.usage_budget import sum_usage_from_trace

                        self.usage_budget.record_turn(
                            entry=entry_key,
                            usage=sum_usage_from_trace(result.trace),
                        )
                    self._record_turn(
                        session_id,
                        duration_ms=duration_ms,
                        stop_reason=result.stop_reason,
                        entry=entry_key,
                        workspace_path=effective_ws,
                        langfuse_trace_id=lf_trace.id or None,
                    )
                    if lf_trace.id:
                        self._last_langfuse_trace_id[session_id] = lf_trace.id
                        result.langfuse_trace_id = lf_trace.id
                    lf_trace.update(
                        output={
                            "content": result.content,
                            "stop_reason": result.stop_reason,
                            "tools_used": list(result.tools_used),
                        },
                        metadata={
                            "entry": entry_key,
                            "workspace_path": effective_ws,
                            "duration_ms": duration_ms,
                        },
                    )
                    if use_stream and bus is not None:
                        if result.stop_reason == "paused_for_approval":
                            approval = self.approvals.get(result.approval_id)
                            await self._publish_stream(
                                bus,
                                channel=channel,
                                chat_id=session_id,
                                kind="approval_required",
                                extra={"approval": approval.public() if approval else {}},
                            )
                            return result
                        await self._publish_stream(
                            bus,
                            channel=channel,
                            chat_id=session_id,
                            kind="turn_ok",
                            text=result.content,
                            extra={
                                # Only suppress the follow-up ``message`` frame when
                                # deltas already delivered the answer (avoid duplicates).
                                # Slash commands like /compact never stream.
                                "_streamed": bool(result.streamed_answer),
                                "tools_used": list(result.tools_used),
                                "trace": list(result.trace),
                                "stop_reason": result.stop_reason,
                                "reasoning": result.reasoning,
                                "langfuse_trace_id": result.langfuse_trace_id or "",
                                "used_provider": result.used_provider,
                                "used_preset": result.used_preset,
                            },
                        )
                        await bus.publish_outbound(
                            OutboundMessage(
                                channel=channel,
                                chat_id=session_id,
                                content="",
                                metadata={"kind": "turn_end"},
                                user_id=(principal.user_id if principal else None),
                            )
                        )
                    return result
        except KeyError:
            raise
        except Exception as exc:
            from minibot.observability.usage_budget import BudgetExceeded

            if isinstance(exc, BudgetExceeded):
                raise
            raise RuntimeError(f"handle_turn failed (entry={entry_key}): {exc}") from exc
        finally:
            if parent_token is not None:
                from minibot.agent.tools.spawn import reset_parent_session

                reset_parent_session(parent_token)
            reset_session(session_token)
            reset_workspace(ws_token)
            abort_ev.clear()

    def _save_pending_approval(self, session_id: str, result: AgentRunResult) -> None:
        if result.stop_reason != "paused_for_approval" or result.approval_id:
            return
        calls = list(result.pending_tool_calls or [])
        if not calls:
            return
        checks = [
            self.tools.approval_required(str(call.get("name") or ""), dict(call.get("arguments") or {}))
            for call in calls
        ]
        reason = next((item[1] for item in checks if item[0]), "A human decision is required.")
        risks = [item[2] for item in checks if item[0]]
        risk = "critical" if "critical" in risks else "high" if "high" in risks else "unknown"
        approval = self.approvals.create(
            session_id=session_id,
            tool_calls=calls,
            continuation_messages=list(result.messages),
            reason=reason,
            risk=risk,
        )
        result.approval_id = approval.id
        result.trace.append({"type": "approval_pending", "approval_id": approval.id, "risk": risk})

    async def resolve_approval(
        self,
        approval_id: str,
        decision: str,
        *,
        bus: MessageBus | None = None,
        channel: str = "websocket",
    ) -> AgentRunResult:
        """Execute or reject a paused tool batch, then continue the ReAct loop."""
        if decision not in {"approve", "reject"}:
            raise ValueError("decision must be approve or reject")
        approval = self.approvals.get(approval_id)
        if approval is None:
            raise KeyError("approval not found")
        if approval.status != "pending":
            raise ValueError(f"approval is {approval.status}")
        session = self.sessions.get(approval.session_id)
        if session is None:
            raise KeyError("session not found")

        async with self.session_lock(approval.session_id):
            ws_token = bind_workspace(session.workspace_path)
            try:
                approval = self.approvals.decide(approval_id, decision)
                assert approval is not None
                tool_messages: list[dict[str, Any]] = []
                direct_tools: list[str] = []
                for call in approval.tool_calls:
                    name = str(call.get("name") or "")
                    if decision == "approve":
                        output = await self.tools.execute(name, dict(call.get("arguments") or {}))
                        direct_tools.append(name)
                    else:
                        output = "Denied by user: this tool operation was not approved."
                    tool_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": str(call.get("id") or ""),
                            "name": name,
                            "content": output,
                        }
                    )
                base = [*approval.continuation_messages, *tool_messages]
                result = await self.runner.run(
                    messages=base,
                    tools=self.tools,
                    model=self._chat_model(),
                    max_iterations=self.config.max_iterations,
                    temperature=self.config.temperature,
                )
                result.tools_used = [*direct_tools, *result.tools_used]
                self._save_pending_approval(approval.session_id, result)
                tail = result.messages[len(approval.continuation_messages) :]
                self.sessions.append_messages(approval.session_id, tail or tool_messages)
                await self.compact_if_needed(approval.session_id)
            finally:
                reset_workspace(ws_token)

        if bus is not None:
            if result.stop_reason == "paused_for_approval":
                next_approval = self.approvals.get(result.approval_id)
                await self._publish_stream(
                    bus,
                    channel=channel,
                    chat_id=approval.session_id,
                    kind="approval_required",
                    extra={"approval": next_approval.public() if next_approval else {}},
                )
            else:
                await self._publish_stream(
                    bus,
                    channel=channel,
                    chat_id=approval.session_id,
                    kind="turn_ok",
                    text=result.content,
                    extra={"tools_used": result.tools_used, "trace": result.trace, "stop_reason": result.stop_reason},
                )
                principal = current_principal()
                await bus.publish_outbound(
                    OutboundMessage(
                        channel=channel,
                        chat_id=approval.session_id,
                        content="",
                        metadata={"kind": "turn_end"},
                        user_id=(principal.user_id if principal else None),
                    )
                )
        return result

    async def _publish_stream(
        self,
        bus: MessageBus,
        *,
        channel: str,
        chat_id: str,
        kind: str,
        text: str = "",
        stream_id: str = "",
        extra: dict[str, Any] | None = None,
    ) -> None:
        meta: dict[str, Any] = {"kind": kind}
        if stream_id:
            meta["stream_id"] = stream_id
        if extra:
            meta.update(extra)
        principal = current_principal()
        await bus.publish_outbound(
            OutboundMessage(
                channel=channel,
                chat_id=chat_id,
                content=text,
                metadata=meta,
                user_id=(principal.user_id if principal else None),
            )
        )

    async def _run_unlocked(
        self,
        session_id: str,
        content: str,
        *,
        system: str | None,
        model: str | None,
        max_iterations: int | None,
        temperature: float | None,
        stream: bool = False,
        bus: MessageBus | None = None,
        channel: str = "websocket",
        should_abort: Any | None = None,
        media: list[str] | None = None,
    ) -> AgentRunResult:
        from minibot.agent.context import (
            build_system_prompt,
            build_user_content,
            message_for_runner,
            persist_user_message,
        )

        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"unknown session: {session_id}")

        if isinstance(content, str) and content.strip().lower() == "/compact":
            return await self._handle_compact_command(session_id)

        history = [message_for_runner(m) for m in session.messages if m.get("role") in _ROLES]
        stored_user = persist_user_message(content, media)
        user_msg = {
            "role": "user",
            "content": build_user_content(content, image_paths=media),
        }
        context_meta: dict[str, Any] | None = None
        from minibot.observability import langfuse as lf

        prompt_version_id = lf.ensure_system_prompt(self.system_prompt or "")
        if system is not None:
            system_text = system
        else:
            built = build_system_prompt(
                workspace=session.workspace_path,
                identity=self.system_prompt,
                session_summary=session.summary,
                user_message=content if isinstance(content, str) else "",
            )
            system_text = built.text
            context_meta = built.to_trace_meta(session.workspace_path)
            if prompt_version_id:
                context_meta = {**(context_meta or {}), "prompt_version_id": prompt_version_id}

        if stream and bus is not None:
            coalescer = StreamCoalescer()
            result: AgentRunResult | None = None
            async for ev in self.runner.run_stream(
                messages=[*history, user_msg],
                tools=self.tools,
                model=model or self._chat_model(),
                max_iterations=max_iterations if max_iterations is not None else self.config.max_iterations,
                temperature=temperature if temperature is not None else self.config.temperature,
                system=system_text,
                context_meta=context_meta,
                prompt_version_id=prompt_version_id,
                should_abort=should_abort,
            ):
                if ev.kind == "delta" and ev.text:
                    for chunk in coalescer.push_text(ev.text):
                        await self._publish_stream(
                            bus,
                            channel=channel,
                            chat_id=session_id,
                            kind="delta",
                            text=chunk,
                            stream_id=ev.stream_id,
                        )
                elif ev.kind == "reasoning_delta" and ev.text:
                    for chunk in coalescer.push_reasoning(ev.text):
                        await self._publish_stream(
                            bus,
                            channel=channel,
                            chat_id=session_id,
                            kind="reasoning_delta",
                            text=chunk,
                            stream_id=ev.stream_id,
                        )
                elif ev.kind == "reasoning_end":
                    for kind, chunk in coalescer.flush():
                        await self._publish_stream(
                            bus,
                            channel=channel,
                            chat_id=session_id,
                            kind=kind,
                            text=chunk,
                            stream_id=ev.stream_id,
                        )
                    await self._publish_stream(
                        bus,
                        channel=channel,
                        chat_id=session_id,
                        kind="reasoning_end",
                        stream_id=ev.stream_id,
                    )
                elif ev.kind == "stream_end":
                    for kind, chunk in coalescer.flush():
                        await self._publish_stream(
                            bus,
                            channel=channel,
                            chat_id=session_id,
                            kind=kind,
                            text=chunk,
                            stream_id=ev.stream_id,
                        )
                    await self._publish_stream(
                        bus,
                        channel=channel,
                        chat_id=session_id,
                        kind="stream_end",
                        stream_id=ev.stream_id,
                    )
                elif ev.kind == "tool_call_start":
                    await self._publish_stream(
                        bus,
                        channel=channel,
                        chat_id=session_id,
                        kind="tool_call_start",
                        text=ev.name,
                        extra={"name": ev.name, "detail": ev.detail, **ev.data},
                    )
                elif ev.kind == "tool_result":
                    await self._publish_stream(
                        bus,
                        channel=channel,
                        chat_id=session_id,
                        kind="tool_result",
                        text=ev.text,
                        extra={"name": ev.name, **ev.data},
                    )
                elif ev.kind == "stream_aborted":
                    for kind, chunk in coalescer.flush():
                        await self._publish_stream(
                            bus,
                            channel=channel,
                            chat_id=session_id,
                            kind=kind,
                            text=chunk,
                        )
                    await self._publish_stream(
                        bus,
                        channel=channel,
                        chat_id=session_id,
                        kind="stream_aborted",
                        extra={"_streamed": True},
                    )
                elif ev.kind == "provider_switched":
                    await self._publish_stream(
                        bus,
                        channel=channel,
                        chat_id=session_id,
                        kind="provider_switched",
                        extra=dict(ev.data or {}),
                    )
                elif ev.kind == "done":
                    result = ev.data.get("result")

            for kind, chunk in coalescer.flush():
                await self._publish_stream(
                    bus,
                    channel=channel,
                    chat_id=session_id,
                    kind=kind,
                    text=chunk,
                )

            if result is None:
                result = AgentRunResult(content="(empty)", messages=[*history, user_msg], stop_reason="error")

            result.streamed_answer = True
            self._save_pending_approval(session_id, result)
            new_tail = result.messages[len(history) :]
            if new_tail and new_tail[0].get("role") == "system":
                new_tail = new_tail[1:]
            if new_tail and new_tail[0].get("role") == "user":
                new_tail[0] = stored_user
            self.sessions.append_messages(
                session_id,
                new_tail if new_tail else [stored_user, {"role": "assistant", "content": result.content}],
            )
            await self.compact_if_needed(session_id)
            return result

        result = await self.runner.run(
            messages=[*history, user_msg],
            tools=self.tools,
            model=model or self._chat_model(),
            max_iterations=max_iterations if max_iterations is not None else self.config.max_iterations,
            temperature=temperature if temperature is not None else self.config.temperature,
            system=system_text,
            context_meta=context_meta,
            prompt_version_id=prompt_version_id,
            should_abort=should_abort,
        )
        self._save_pending_approval(session_id, result)
        new_tail = result.messages[len(history) :]
        if new_tail and new_tail[0].get("role") == "system":
            new_tail = new_tail[1:]
        if new_tail and new_tail[0].get("role") == "user":
            new_tail[0] = stored_user
        self.sessions.append_messages(
            session_id,
            new_tail if new_tail else [stored_user, {"role": "assistant", "content": result.content}],
        )
        await self.compact_if_needed(session_id)
        return result

    async def _handle_compact_command(self, session_id: str) -> AgentRunResult:
        """Force-compact session history for the `/compact` slash command."""
        event = await self.compact_if_needed(session_id, force=True)
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"unknown session: {session_id}")

        if event is None:
            content = "Compaction is unavailable for this session."
        elif event.get("skipped"):
            content = (
                f"Nothing to compact — only {event.get('before', 0)} messages "
                f"(need more than {event.get('keep', 2)} to archive older turns)."
            )
        elif not event.get("ok"):
            content = f"Compaction failed: {event.get('error') or 'unknown error'}"
        else:
            preview = str(event.get("summary_preview") or "").strip()
            content = (
                f"Compacted history: {event.get('before')} → {event.get('after')} messages."
            )
            if preview:
                content = f"{content}\n\nSummary preview:\n{preview}"

        # Persist the assistant reply (not the /compact user line) so WebUI history
        # and refresh keep the result after the WS ``message`` frame is delivered.
        self.sessions.append_messages(
            session_id,
            [{"role": "assistant", "content": content}],
        )
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"unknown session: {session_id}")

        return AgentRunResult(
            content=content,
            messages=list(session.messages),
            stop_reason="completed",
            trace=[{"type": "compact_command", "event": event}],
            streamed_answer=False,
        )

    async def compact_if_needed(
        self,
        session_id: str,
        *,
        force: bool = False,
    ) -> dict[str, Any] | None:
        """Summarize older messages into session.summary when over threshold (or force)."""
        from minibot.agent.context import messages_to_compact_blob

        threshold = int(getattr(self.config, "compact_threshold", 0) or 0)
        configured_keep = max(2, int(getattr(self.config, "compact_keep_recent", 16) or 16))
        if not force and threshold <= 0:
            return None
        session = self.sessions.get(session_id)
        if session is None:
            return None
        before = len(session.messages)
        if not force and before <= threshold:
            return None

        # Auto-compact keeps the configured recent window. Manual /compact must still
        # work below that window, so force keeps at most half the current history.
        keep = configured_keep
        if force:
            keep = min(configured_keep, max(2, before // 2))

        if before <= keep:
            if not force:
                return None
            event = {
                "session_id": session_id,
                "finished_at": _now_iso(),
                "before": before,
                "after": before,
                "keep": keep,
                "summary_preview": "",
                "ok": True,
                "skipped": True,
                "error": None,
                "forced": True,
            }
            self._compaction_log.insert(0, event)
            del self._compaction_log[40:]
            return event

        old = session.messages[:-keep]
        recent = session.messages[-keep:]
        blob = messages_to_compact_blob(old)
        event: dict[str, Any] = {
            "session_id": session_id,
            "finished_at": _now_iso(),
            "before": before,
            "after": keep,
            "keep": keep,
            "summary_preview": "",
            "ok": True,
            "skipped": False,
            "error": None,
            "forced": force,
        }
        try:
            from minibot.observability import langfuse as lf

            compact_messages = [
                {
                    "role": "system",
                    "content": (
                        "You compress older chat history into a concise archival summary. "
                        "Keep facts, decisions, paths, and open tasks. No fluff."
                    ),
                },
                {"role": "user", "content": blob or "(empty)"},
            ]
            with lf.observation(
                as_type="generation",
                name="compaction",
                model=self._chat_model(),
                input={"message_count": len(old), "before": before, "keep": keep, "forced": force},
                model_parameters={"temperature": 0.0},
            ) as gen:
                response = await self.runner.provider.chat(
                    compact_messages,
                    tools=None,
                    model=self._chat_model(),
                    temperature=0.0,
                )
                piece = (response.content or "").strip() or "(empty summary)"
                gen.update(
                    output={"summary_preview": piece[:400]},
                    usage=lf.usage_dict(response.usage),
                )
            if session.summary.strip():
                new_summary = f"{session.summary.strip()}\n\n{piece}"
            else:
                new_summary = piece
            self.sessions.apply_compaction(
                session_id,
                messages=list(recent),
                summary=new_summary,
            )
            event["after"] = len(recent)
            event["summary_preview"] = piece[:400]
        except Exception as exc:
            event["ok"] = False
            event["error"] = f"{type(exc).__name__}: {exc}"
            event["after"] = before

        self._compaction_log.insert(0, event)
        del self._compaction_log[40:]
        return event

    def context_snapshot(self, session_id: str) -> dict[str, Any]:
        from minibot.agent.context import inspect_context

        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"unknown session: {session_id}")
        info = inspect_context(
            workspace=session.workspace_path,
            identity=self.system_prompt,
            session_summary=session.summary,
            message_count=len(session.messages),
        )
        info["session_id"] = session_id
        info["compaction_log"] = [
            e for e in self._compaction_log if e.get("session_id") == session_id
        ][:10]
        info["compact_threshold"] = getattr(self.config, "compact_threshold", 0)
        info["compact_keep_recent"] = getattr(self.config, "compact_keep_recent", 0)
        return info

    def last_langfuse_trace_id(self, session_id: str) -> str | None:
        return self._last_langfuse_trace_id.get(session_id)

    def _record_turn(
        self,
        session_id: str,
        *,
        duration_ms: float | None,
        stop_reason: str | None,
        entry: str = "unknown",
        workspace_path: str | None = None,
        langfuse_trace_id: str | None = None,
    ) -> None:
        self._last_turns.insert(
            0,
            {
                "session_id": session_id,
                "finished_at": _now_iso(),
                "duration_ms": duration_ms,
                "stop_reason": stop_reason,
                "entry": entry,
                "workspace_path": workspace_path,
                "langfuse_trace_id": langfuse_trace_id,
            },
        )
        del self._last_turns[_LAST_TURNS_MAX:]

    def runtime_snapshot(self) -> dict[str, Any]:
        """Read-only view for Dev UI ``/api/dev/runtime``."""
        sessions: list[dict[str, Any]] = []
        for session_id, slot in sorted(self._locks.items()):
            stored = self.sessions.get(session_id)
            sessions.append(
                {
                    "session_id": session_id,
                    "lock": "held" if slot.held else "idle",
                    "waiters": slot.waiters,
                    "last_duration_ms": slot.last_duration_ms,
                    "last_finished_at": slot.last_finished_at,
                    "last_stop_reason": slot.last_stop_reason,
                    "last_workspace": slot.last_workspace,
                    "workspace_path": stored.workspace_path if stored else None,
                }
            )
        return {
            "entry_path": "loop",
            "entry_counts": dict(self._entry_counts),
            "sessions": sessions,
            "last_turns": list(self._last_turns),
        }
