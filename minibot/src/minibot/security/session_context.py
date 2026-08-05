"""Per-turn session id for tools (sandbox pooling)."""

from __future__ import annotations

from contextvars import ContextVar, Token

_session_var: ContextVar[str | None] = ContextVar("minibot_session_id", default=None)


def bind_session(session_id: str) -> Token:
    return _session_var.set(session_id)


def reset_session(token: Token) -> None:
    _session_var.reset(token)


def current_session_id() -> str | None:
    return _session_var.get()
