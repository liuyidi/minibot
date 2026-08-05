"""Background bus workers: inbound → Loop → outbound → WS hub / IM channels."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from minibot.bus.events import InboundMessage, OutboundMessage
from minibot.security.channel_context import bind_channel, reset_channel

logger = logging.getLogger(__name__)

_WS_LIKE = frozenset({"websocket", "ws", "dev"})


class BusWorker:
    """Owns the inbound consumer + outbound fanout tasks for one AppState."""

    def __init__(self, state: Any) -> None:
        self.state = state
        self._stop = asyncio.Event()
        self._tasks: list[asyncio.Task[None]] = []
        self.paused = False
        self.running = False
        self.last_error: str | None = None

    def status(self) -> dict[str, Any]:
        return {
            "running": self.running,
            "paused": self.paused,
            "tasks": len([t for t in self._tasks if not t.done()]),
            "last_error": self.last_error,
        }

    def start(self) -> None:
        if self.running:
            return
        self._stop.clear()
        self.running = True
        self._tasks = [
            asyncio.create_task(self._inbound_loop(), name="minibot-bus-inbound"),
            asyncio.create_task(self._outbound_loop(), name="minibot-bus-outbound"),
        ]

    async def stop(self) -> None:
        self._stop.set()
        self.running = False
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []

    async def _inbound_loop(self) -> None:
        bus = self.state.bus
        while not self._stop.is_set():
            if self.paused:
                await asyncio.sleep(0.15)
                continue
            try:
                msg = bus.inbound.get_nowait()
            except asyncio.QueueEmpty:
                await asyncio.sleep(0.05)
                continue
            bus.note_inbound_consumed(msg)
            await self._handle_inbound(msg)

    def _ensure_session(self, session_id: str, *, title: str = "") -> None:
        if self.state.sessions.get(session_id) is not None:
            return
        self.state.sessions.create(session_id=session_id, title=title or session_id)

    async def _handle_inbound(self, msg: InboundMessage) -> None:
        channel = (msg.channel or "websocket").strip() or "websocket"
        platform_chat_id = msg.chat_id
        session_id = msg.session_key
        meta = msg.metadata or {}
        job_id = str(meta.get("job_id") or "")
        is_cron = str(meta.get("source") or "") == "cron" or channel == "cron"
        is_ws = channel in _WS_LIKE

        if is_cron:
            entry = "cron"
        elif is_ws:
            entry = "ws"
        elif channel == "feishu":
            entry = "feishu"
        elif channel == "weixin":
            entry = "weixin"
        else:
            entry = channel if channel in getattr(self.state.loop, "_entry_counts", {}) else "unknown"

        token = bind_channel(channel)
        try:
            if is_ws or is_cron:
                if self.state.sessions.get(session_id) is None:
                    await bus_publish_error(
                        self.state,
                        channel=channel,
                        chat_id=platform_chat_id,
                        detail="unknown_chat",
                    )
                    self._complete_cron_wait(job_id, error=RuntimeError("unknown_chat"))
                    return
            else:
                self._ensure_session(session_id, title=f"{channel}:{platform_chat_id}")

            result = await self.state.loop.handle_turn(
                session_id,
                msg.content,
                entry=entry,
                bus=self.state.bus,
                channel=channel,
                stream=False if not is_ws and not is_cron else None,
            )

            # WebUI/cron stream via Loop; IM channels need a final text reply on the bus.
            if not is_ws and not is_cron:
                out_meta: dict[str, Any] = {
                    "kind": "turn_ok",
                    "tools_used": list(result.tools_used or []),
                    "trace": list(result.trace or []),
                    "stop_reason": result.stop_reason,
                    "langfuse_trace_id": result.langfuse_trace_id or "",
                    "reasoning": result.reasoning or "",
                }
                reply_to = meta.get("message_id") or meta.get("reply_to")
                await self.state.bus.publish_outbound(
                    OutboundMessage(
                        channel=channel,
                        chat_id=platform_chat_id,
                        content=result.content or "",
                        reply_to=str(reply_to) if reply_to else None,
                        metadata=out_meta,
                    )
                )
            self._complete_cron_wait(job_id)
        except Exception as exc:
            from minibot.observability.usage_budget import BudgetExceeded

            self.last_error = f"{type(exc).__name__}: {exc}"
            if isinstance(exc, BudgetExceeded):
                logger.warning(
                    "bus inbound blocked by LLM budget chat_id=%s reason=%s",
                    platform_chat_id,
                    exc.reason,
                )
                await bus_publish_error(
                    self.state,
                    channel=channel,
                    chat_id=platform_chat_id,
                    detail=f"budget_exceeded:{exc.reason}",
                )
            else:
                logger.exception(
                    "bus inbound handle_turn failed channel=%s chat_id=%s",
                    channel,
                    platform_chat_id,
                )
                await bus_publish_error(
                    self.state,
                    channel=channel,
                    chat_id=platform_chat_id,
                    detail=str(exc),
                )
            self._complete_cron_wait(job_id, error=exc)
        finally:
            reset_channel(token)

    def _complete_cron_wait(self, job_id: str, *, error: BaseException | None = None) -> None:
        if not job_id:
            return
        cron = getattr(self.state, "cron", None)
        if cron is None:
            return
        cron.complete_wait(job_id, error=error)

    async def _outbound_loop(self) -> None:
        from minibot.api.ws import deliver_outbound

        bus = self.state.bus
        while not self._stop.is_set():
            try:
                msg = await asyncio.wait_for(bus.consume_outbound(), timeout=0.5)
            except TimeoutError:
                continue
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.last_error = f"consume_outbound: {exc}"
                logger.exception("bus outbound consume failed")
                continue
            try:
                channel = (msg.channel or "websocket").strip() or "websocket"
                if channel in _WS_LIKE:
                    await deliver_outbound(msg)
                    continue
                manager = getattr(self.state, "channels", None)
                if manager is not None and await manager.deliver(msg):
                    continue
                # Cron / unknown: still try WS hub so Dev UI can observe.
                if channel == "cron":
                    await deliver_outbound(msg)
                else:
                    logger.warning("No outbound sink for channel=%s chat_id=%s", channel, msg.chat_id)
            except Exception as exc:
                self.last_error = f"deliver_outbound: {exc}"
                logger.exception("bus outbound deliver failed chat_id=%s", msg.chat_id)


async def bus_publish_error(
    state: Any,
    *,
    channel: str,
    chat_id: str,
    detail: str,
) -> None:
    await state.bus.publish_outbound(
        OutboundMessage(
            channel=channel or "websocket",
            chat_id=chat_id,
            content="",
            metadata={"kind": "turn_error", "detail": detail},
        )
    )
