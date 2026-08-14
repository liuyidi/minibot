"""Base channel interface for IM platforms."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from minibot.bus.events import InboundMessage, OutboundMessage
from minibot.bus.queue import MessageBus


class _BraceLogger:
    """stdlib logger that accepts loguru-style ``"{}..."`` placeholders."""

    def __init__(self, name: str) -> None:
        self._log = logging.getLogger(name)

    def _msg(self, msg: Any, args: tuple[Any, ...]) -> str:
        text = str(msg)
        if args and "{}" in text:
            try:
                return text.format(*args)
            except (IndexError, ValueError):
                return text
        return text

    def debug(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self._log.debug(self._msg(msg, args), **kwargs)

    def info(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self._log.info(self._msg(msg, args), **kwargs)

    def warning(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self._log.warning(self._msg(msg, args), **kwargs)

    def error(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self._log.error(self._msg(msg, args), **kwargs)

    def exception(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self._log.exception(self._msg(msg, args), **kwargs)


class BaseChannel(ABC):
    name: str = "base"
    display_name: str = "Base"
    send_progress: bool = False
    send_tool_hints: bool = False
    show_reasoning: bool = False

    def __init__(self, config: Any, bus: MessageBus, *, owner_user_id: str | None = None) -> None:
        self.config = config
        self.bus = bus
        self.owner_user_id = (owner_user_id or "").strip() or "system"
        self._running = False
        self.logger = _BraceLogger(f"minibot.channels.{self.name}")

    async def transcribe_audio(self, file_path: str | Path) -> str:
        del file_path
        return ""

    async def login(self, force: bool = False) -> bool:
        del force
        return True

    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...

    @abstractmethod
    async def send(self, msg: OutboundMessage) -> None: ...

    async def send_delta(
        self, chat_id: str, delta: str, metadata: dict[str, Any] | None = None
    ) -> None:
        del chat_id, delta, metadata

    @property
    def supports_streaming(self) -> bool:
        cfg = self.config
        streaming = (
            cfg.get("streaming", False) if isinstance(cfg, dict) else getattr(cfg, "streaming", False)
        )
        return bool(streaming) and type(self).send_delta is not BaseChannel.send_delta

    def is_allowed(self, sender_id: str) -> bool:
        if isinstance(self.config, dict):
            allow_list = self.config.get("allow_from") or self.config.get("allowFrom") or []
        else:
            allow_list = getattr(self.config, "allow_from", None) or []
        if "*" in allow_list:
            return True
        return str(sender_id) in {str(x) for x in allow_list}

    async def _handle_message(
        self,
        sender_id: str,
        chat_id: str,
        content: str,
        media: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        session_key: str | None = None,
        is_dm: bool = False,
    ) -> None:
        if not self.is_allowed(sender_id):
            self.logger.warning(
                "Access denied for sender %s (dm=%s). Add to allow_from.",
                sender_id,
                is_dm,
            )
            return

        meta = dict(metadata or {})
        if self.supports_streaming:
            meta["_wants_stream"] = True

        await self.bus.publish_inbound(
            InboundMessage(
                channel=self.name,
                sender_id=str(sender_id),
                chat_id=str(chat_id),
                content=content,
                media=media or [],
                metadata=meta,
                session_key_override=session_key,
                user_id=self.owner_user_id,
            )
        )

    @classmethod
    def default_config(cls) -> dict[str, Any]:
        return {"enabled": False}

    @property
    def is_running(self) -> bool:
        return self._running
