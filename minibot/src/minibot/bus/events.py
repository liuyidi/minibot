"""Message bus event types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(slots=True)
class InboundMessage:
    channel: str
    sender_id: str
    chat_id: str
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    media: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    session_key_override: str | None = None
    # Owner of the per-user runtime that should handle this message.
    # BusWorker binds principal/data_dir from this before calling handle_turn.
    user_id: str | None = None

    @property
    def session_key(self) -> str:
        if self.session_key_override:
            return self.session_key_override
        if self.channel in {"websocket", "cron", "dev"}:
            return self.chat_id
        return f"{self.channel}:{self.chat_id}"


@dataclass(slots=True)
class OutboundMessage:
    channel: str
    chat_id: str
    content: str
    reply_to: str | None = None
    media: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    user_id: str | None = None
