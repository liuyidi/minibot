"""Minimal channel manager: start/stop enabled IM channels and deliver outbound."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from minibot.bus.events import OutboundMessage
from minibot.bus.queue import MessageBus
from minibot.channels.base import BaseChannel

log = logging.getLogger("minibot.channels.manager")


class ChannelManager:
    def __init__(self, bus: MessageBus) -> None:
        self.bus = bus
        self.channels: dict[str, BaseChannel] = {}
        self._tasks: list[asyncio.Task[None]] = []
        self.last_error: str | None = None

    def register(self, channel: BaseChannel) -> None:
        self.channels[channel.name] = channel

    @property
    def enabled_names(self) -> list[str]:
        return sorted(self.channels)

    def status(self) -> dict[str, Any]:
        return {
            "channels": {
                name: {
                    "running": ch.is_running,
                    "display_name": ch.display_name,
                }
                for name, ch in self.channels.items()
            },
            "last_error": self.last_error,
        }

    async def start(self) -> None:
        for name, channel in self.channels.items():
            log.info("Starting channel %s", name)
            self._tasks.append(asyncio.create_task(self._run_channel(name, channel)))

    async def _run_channel(self, name: str, channel: BaseChannel) -> None:
        try:
            await channel.start()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"{name}: {exc}"
            log.exception("Channel %s failed", name)

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []
        for name, channel in self.channels.items():
            try:
                await channel.stop()
            except Exception:  # noqa: BLE001
                log.exception("Error stopping channel %s", name)

    async def deliver(self, msg: OutboundMessage) -> bool:
        """Send to a registered IM channel. Returns False if channel unknown."""
        channel = self.channels.get(msg.channel)
        if channel is None:
            return False
        meta = msg.metadata or {}
        # MVP: ignore stream/progress frames when streaming is off.
        if meta.get("_stream_delta") or meta.get("_stream_end") or meta.get("_progress"):
            if not channel.supports_streaming and not meta.get("_stream_end"):
                return True
        if meta.get("_streamed"):
            return True
        if not (msg.content or "").strip() and not msg.media:
            kind = str(meta.get("kind") or "")
            if kind == "turn_error":
                detail = str(meta.get("detail") or "error")
                await channel.send(
                    OutboundMessage(
                        channel=msg.channel,
                        chat_id=msg.chat_id,
                        content=f"⚠️ {detail}",
                        reply_to=msg.reply_to,
                        metadata=meta,
                    )
                )
                return True
            if kind in {"turn_end", "stream_end", "reasoning_end"}:
                return True
        await channel.send(msg)
        return True
