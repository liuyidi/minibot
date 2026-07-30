"""Background bus workers: inbound → Loop → outbound → WS hub."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from minibot.bus.events import InboundMessage, OutboundMessage

logger = logging.getLogger(__name__)


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
            # get_nowait so pause cannot race with an in-flight ``await get()``.
            try:
                msg = bus.inbound.get_nowait()
            except asyncio.QueueEmpty:
                await asyncio.sleep(0.05)
                continue
            bus.note_inbound_consumed(msg)
            await self._handle_inbound(msg)

    async def _handle_inbound(self, msg: InboundMessage) -> None:
        chat_id = msg.chat_id
        meta = msg.metadata or {}
        job_id = str(meta.get("job_id") or "")
        is_cron = str(meta.get("source") or "") == "cron" or msg.channel == "cron"
        entry = "cron" if is_cron else "ws"
        try:
            if self.state.sessions.get(chat_id) is None:
                await bus_publish_error(
                    self.state,
                    channel=msg.channel,
                    chat_id=chat_id,
                    detail="unknown_chat",
                )
                self._complete_cron_wait(job_id, error=RuntimeError("unknown_chat"))
                return
            result = await self.state.loop.handle_turn(
                chat_id,
                msg.content,
                entry=entry,
                bus=self.state.bus,
                channel=msg.channel or "websocket",
            )
            if entry not in {"ws", "cron"}:
                out_meta: dict[str, Any] = {
                    "kind": "turn_ok",
                    "tools_used": list(result.tools_used or []),
                    "trace": list(result.trace or []),
                    "stop_reason": result.stop_reason,
                    "langfuse_trace_id": result.langfuse_trace_id or "",
                    "reasoning": result.reasoning or "",
                }
                if is_cron:
                    out_meta["source"] = "cron"
                    if job_id:
                        out_meta["job_id"] = job_id
                    if meta.get("job_name"):
                        out_meta["job_name"] = meta.get("job_name")
                await self.state.bus.publish_outbound(
                    OutboundMessage(
                        channel=msg.channel or "websocket",
                        chat_id=chat_id,
                        content=result.content or "",
                        metadata=out_meta,
                    )
                )
            self._complete_cron_wait(job_id)
        except Exception as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"
            logger.exception("bus inbound handle_turn failed chat_id=%s", chat_id)
            await bus_publish_error(
                self.state,
                channel=msg.channel,
                chat_id=chat_id,
                detail=f"{type(exc).__name__}: {exc}",
            )
            self._complete_cron_wait(job_id, error=exc)

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
                await deliver_outbound(msg)
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
