"""Dev-only primary-slot fault injection for FallbackProvider debugging."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal

from minibot.providers.base import (
    LLMProvider,
    LLMResponse,
    StreamEnd,
    StreamEvent,
)

FaultMode = Literal[
    "soft_error",
    "http_429",
    "http_503",
    "timeout",
    "connection",
]

FAULT_MODES: tuple[FaultMode, ...] = (
    "soft_error",
    "http_429",
    "http_503",
    "timeout",
    "connection",
)

# Legend for Dev UI (Insight: normal vs abnormal triggers)
FAILOVER_RULES: list[dict[str, str]] = [
    {
        "kind": "soft_error",
        "label": "soft error",
        "trigger": "finish_reason == error",
        "example": "LLM error HTTP 401: invalid key",
    },
    {
        "kind": "http_429",
        "label": "HTTP 429",
        "trigger": "exception status_code == 429",
        "example": "rate limited",
    },
    {
        "kind": "http_5xx",
        "label": "HTTP 5xx",
        "trigger": "exception status_code >= 500",
        "example": "503 Service Unavailable",
    },
    {
        "kind": "timeout",
        "label": "timeout",
        "trigger": "TimeoutError / timed out",
        "example": "asyncio.TimeoutError",
    },
    {
        "kind": "connection",
        "label": "connection",
        "trigger": "connection refused / ConnectError",
        "example": "ConnectError: All connection attempts failed",
    },
]


def classify_failover_reason(reason: str) -> str:
    """Map free-text switch reason → kind for Dev UI badges."""
    text = (reason or "").lower()
    if "429" in text or "rate limit" in text:
        return "http_429"
    if any(code in text for code in ("500", "502", "503", "504")) or "http 5" in text:
        return "http_5xx"
    if "timeout" in text or "timed out" in text:
        return "timeout"
    if "connect" in text or "connection" in text:
        return "connection"
    if "finish_reason" in text or "error" in text or "llm error" in text:
        return "soft_error"
    return "other"


@dataclass
class FaultController:
    """One-shot (or sticky) fault schedule for the primary provider wrapper."""

    mode: FaultMode | None = None
    oneshot: bool = True
    remaining: int = 0
    armed_at: str = ""
    last_fired: dict[str, Any] | None = None
    history: list[dict[str, Any]] = field(default_factory=list)

    def snapshot(self) -> dict[str, Any]:
        return {
            "armed": self.remaining > 0 and self.mode is not None,
            "mode": self.mode,
            "oneshot": self.oneshot,
            "remaining": self.remaining,
            "armed_at": self.armed_at,
            "last_fired": self.last_fired,
            "history": list(self.history[:10]),
            "modes": list(FAULT_MODES),
            "rules": list(FAILOVER_RULES),
        }

    def arm(self, mode: str, *, oneshot: bool = True, count: int = 1) -> dict[str, Any]:
        if mode not in FAULT_MODES:
            raise ValueError(f"unknown fault mode {mode!r}; choose from {FAULT_MODES}")
        n = 1 if oneshot else max(1, int(count))
        from datetime import datetime, timezone

        self.mode = mode  # type: ignore[assignment]
        self.oneshot = oneshot
        self.remaining = n
        self.armed_at = datetime.now(timezone.utc).isoformat()
        return self.snapshot()

    def disarm(self) -> dict[str, Any]:
        self.mode = None
        self.remaining = 0
        self.armed_at = ""
        return self.snapshot()

    def consume(self) -> FaultMode | None:
        if self.remaining <= 0 or self.mode is None:
            return None
        mode = self.mode
        self.remaining -= 1
        if self.remaining <= 0 and self.oneshot:
            self.mode = None
            self.armed_at = ""
        entry = {"mode": mode, "remaining_after": self.remaining}
        self.last_fired = entry
        self.history.insert(0, entry)
        self.history = self.history[:20]
        return mode


class _HttpStatusError(Exception):
    """Minimal stand-in so is_failover_exception sees status_code."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


class _ConnectError(Exception):
    def __init__(self, message: str = "connection refused (dev fault inject)") -> None:
        super().__init__(message)


def raise_or_soft_for_mode(mode: FaultMode) -> LLMResponse:
    """Apply armed mode: soft → LLMResponse(error); else raise."""
    if mode == "soft_error":
        return LLMResponse(
            content="LLM error (dev fault inject): soft_error",
            finish_reason="error",
        )
    if mode == "http_429":
        raise _HttpStatusError(429, "HTTP 429 Too Many Requests (dev fault inject)")
    if mode == "http_503":
        raise _HttpStatusError(503, "HTTP 503 Service Unavailable (dev fault inject)")
    if mode == "timeout":
        raise TimeoutError("dev fault inject: timed out")
    if mode == "connection":
        raise _ConnectError()
    raise ValueError(f"unhandled fault mode {mode!r}")


class FaultInjectingProvider(LLMProvider):
    """Wraps an inner provider; consumes FaultController before forwarding."""

    def __init__(self, inner: LLMProvider, controller: FaultController) -> None:
        self.inner = inner
        self.controller = controller

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> LLMResponse:
        mode = self.controller.consume()
        if mode is not None:
            soft = raise_or_soft_for_mode(mode)
            # soft path returns; raise paths never return
            return soft
        return await self.inner.chat(
            messages,
            tools=tools,
            model=model,
            temperature=temperature,
        )

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> AsyncIterator[StreamEvent]:
        mode = self.controller.consume()
        if mode is not None:
            if mode == "soft_error":
                yield StreamEnd(
                    finish_reason="error",
                    content="LLM error (dev fault inject): soft_error",
                )
                return
            # Exception modes: raise before any content so FallbackProvider can switch
            raise_or_soft_for_mode(mode)
            return
        async for ev in self.inner.chat_stream(
            messages,
            tools=tools,
            model=model,
            temperature=temperature,
        ):
            yield ev


async def simulate_fallback_chain(
    *,
    mode: FaultMode,
    stats: Any | None = None,
) -> dict[str, Any]:
    """Isolated Fake-like chain: primary fails with mode, backup succeeds.

    Does not touch live AppState provider — always works offline for Dev UI.
    """
    from minibot.providers.fallback import FallbackProvider, FallbackStats, ProviderSlot

    class _Primary(LLMProvider):
        async def chat(self, messages, *, tools=None, model, temperature=None):  # noqa: ANN001
            return raise_or_soft_for_mode(mode)

        async def chat_stream(self, messages, *, tools=None, model, temperature=None):  # noqa: ANN001
            if mode == "soft_error":
                yield StreamEnd(
                    finish_reason="error",
                    content="LLM error (dev fault inject): soft_error",
                )
                return
            raise_or_soft_for_mode(mode)
            if False:  # pragma: no cover — make this an async generator
                yield StreamEnd()

    class _Backup(LLMProvider):
        async def chat(self, messages, *, tools=None, model, temperature=None):  # noqa: ANN001
            return LLMResponse(content=f"backup ok after {mode}", finish_reason="stop")

        async def chat_stream(self, messages, *, tools=None, model, temperature=None):  # noqa: ANN001
            from minibot.providers.base import TextDelta

            yield TextDelta(text=f"backup ok after {mode}")
            yield StreamEnd(finish_reason="stop", content=f"backup ok after {mode}")

    local_stats = stats or FallbackStats()
    switches: list[dict[str, Any]] = []
    fb = FallbackProvider(
        [
            ProviderSlot("primary", "Primary", "openai", "m", "openai_compat", _Primary()),
            ProviderSlot("backup", "Backup", "openai", "m", "openai_compat", _Backup()),
        ],
        stats=local_stats,
        on_switch=switches.append,
    )
    resp = await fb.chat([{"role": "user", "content": "probe"}], model="m")
    meta = fb.used_meta()
    switch = switches[0] if switches else None
    if switch is not None:
        switch = {**switch, "reason_kind": classify_failover_reason(switch.get("reason") or "")}
    return {
        "ok": True,
        "mode": mode,
        "content": resp.content,
        "finish_reason": resp.finish_reason,
        "used_preset": meta.get("used_preset"),
        "switches": local_stats.switches,
        "switch": switch,
        "reason_kind": (switch or {}).get("reason_kind"),
    }
