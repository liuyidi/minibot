"""Request-scoped principal context."""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class Principal:
    kind: str
    user_id: str
    email: str | None = None
    name: str | None = None
    picture: str | None = None


_principal: ContextVar[Principal | None] = ContextVar("minibot_principal", default=None)
_data_dir: ContextVar[Path | None] = ContextVar("minibot_data_dir", default=None)


def bind_principal(principal: Principal | None) -> None:
    _principal.set(principal)


def current_principal() -> Principal | None:
    return _principal.get()


def current_user_id(default: str = "system") -> str:
    principal = current_principal()
    if principal and principal.user_id.strip():
        return principal.user_id.strip()
    return default


def bind_data_dir(data_dir: Path | None) -> None:
    _data_dir.set(Path(data_dir).expanduser() if data_dir is not None else None)


def current_data_dir() -> Path | None:
    return _data_dir.get()
