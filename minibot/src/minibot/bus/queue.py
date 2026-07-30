"""Async message bus decoupling channels from the agent core."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from minibot.bus.events import InboundMessage, OutboundMessage

_TIMELINE_MAX = 80


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MessageBus:
    def __init__(self) -> None:
        self.inbound: asyncio.Queue[InboundMessage] = asyncio.Queue()
        self.outbound: asyncio.Queue[OutboundMessage] = asyncio.Queue()
        self._timeline: list[dict[str, Any]] = []
        self._stats = {
            "inbound_published": 0,
            "inbound_consumed": 0,
            "outbound_published": 0,
            "outbound_consumed": 0,
        }

    def _record(self, direction: str, kind: str, chat_id: str = "", detail: str = "") -> None:
        self._timeline.insert(
            0,
            {
                "ts": _now_iso(),
                "direction": direction,
                "kind": kind,
                "chat_id": chat_id,
                "detail": detail[:120],
            },
        )
        del self._timeline[_TIMELINE_MAX:]

    async def publish_inbound(self, msg: InboundMessage) -> None:
        await self.inbound.put(msg)
        self._stats["inbound_published"] += 1
        self._record("inbound", "publish", msg.chat_id, msg.content)

    async def consume_inbound(self) -> InboundMessage:
        msg = await self.inbound.get()
        self.note_inbound_consumed(msg)
        return msg

    def note_inbound_consumed(self, msg: InboundMessage) -> None:
        self._stats["inbound_consumed"] += 1
        self._record("inbound", "consume", msg.chat_id, msg.content)

    async def publish_outbound(self, msg: OutboundMessage) -> None:
        await self.outbound.put(msg)
        self._stats["outbound_published"] += 1
        kind = str((msg.metadata or {}).get("kind") or "message")
        self._record("outbound", f"publish:{kind}", msg.chat_id, msg.content)

    async def consume_outbound(self) -> OutboundMessage:
        msg = await self.outbound.get()
        self._stats["outbound_consumed"] += 1
        kind = str((msg.metadata or {}).get("kind") or "message")
        self._record("outbound", f"consume:{kind}", msg.chat_id, msg.content)
        return msg

    def snapshot(self, *, worker: dict[str, Any] | None = None) -> dict[str, Any]:
        """Read-only view for Dev UI ``/api/dev/runtime``."""
        return {
            "inbound_depth": self.inbound.qsize(),
            "outbound_depth": self.outbound.qsize(),
            "stats": dict(self._stats),
            "timeline": list(self._timeline),
            "worker": worker or {},
        }
