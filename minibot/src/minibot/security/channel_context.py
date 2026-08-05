"""Channel name bound for the current agent turn (HITL / routing)."""

from __future__ import annotations

from contextvars import ContextVar, Token

_channel: ContextVar[str] = ContextVar("minibot_channel", default="websocket")


def bind_channel(channel: str) -> Token[str]:
    return _channel.set((channel or "websocket").strip() or "websocket")


def reset_channel(token: Token[str]) -> None:
    _channel.reset(token)


def current_channel() -> str:
    return _channel.get()
