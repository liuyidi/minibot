"""Coalesce high-frequency stream chunks before bus publish."""

from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class StreamCoalescer:
    """Merge text deltas by time/size before flushing."""

    max_interval_s: float = 0.05
    min_chars: int = 32
    _text_buf: str = ""
    _reason_buf: str = ""
    _last_flush: float = field(default_factory=time.monotonic)

    def push_text(self, text: str) -> list[str]:
        if not text:
            return []
        self._text_buf += text
        return self._maybe_flush_text(force=False)

    def push_reasoning(self, text: str) -> list[str]:
        if not text:
            return []
        self._reason_buf += text
        return self._maybe_flush_reason(force=False)

    def flush(self) -> list[tuple[str, str]]:
        """Return list of (kind, text) pending chunks."""
        out: list[tuple[str, str]] = []
        for chunk in self._maybe_flush_text(force=True):
            out.append(("delta", chunk))
        for chunk in self._maybe_flush_reason(force=True):
            out.append(("reasoning_delta", chunk))
        return out

    def _maybe_flush_text(self, *, force: bool) -> list[str]:
        if not self._text_buf:
            return []
        now = time.monotonic()
        if force or len(self._text_buf) >= self.min_chars or (now - self._last_flush) >= self.max_interval_s:
            chunk = self._text_buf
            self._text_buf = ""
            self._last_flush = now
            return [chunk]
        return []

    def _maybe_flush_reason(self, *, force: bool) -> list[str]:
        if not self._reason_buf:
            return []
        now = time.monotonic()
        if force or len(self._reason_buf) >= self.min_chars or (now - self._last_flush) >= self.max_interval_s:
            chunk = self._reason_buf
            self._reason_buf = ""
            self._last_flush = now
            return [chunk]
        return []
