"""Fallback / retry chain across provider slots (Phase 6.5)."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from typing import Any

from minibot.providers.base import (
    LLMProvider,
    LLMResponse,
    ReasoningDelta,
    StreamEnd,
    StreamEvent,
    TextDelta,
    ToolCallDelta,
)

logger = logging.getLogger(__name__)

SwitchCallback = Callable[[dict[str, Any]], None]


@dataclass(slots=True)
class ProviderSlot:
    """One candidate in the fallback chain."""

    id: str
    label: str
    provider_name: str
    model: str
    backend: str
    provider: LLMProvider


@dataclass
class FallbackStats:
    attempts: int = 0
    switches: int = 0
    last_used: str = ""
    last_switch: dict[str, Any] | None = None
    recent: list[dict[str, Any]] = field(default_factory=list)

    def record_switch(self, entry: dict[str, Any]) -> None:
        self.switches += 1
        self.last_switch = entry
        self.recent.insert(0, entry)
        self.recent = self.recent[:20]


def is_failover_response(response: LLMResponse) -> bool:
    """True when a soft error response should trigger the next slot."""
    return response.finish_reason == "error"


def is_failover_exception(exc: BaseException) -> bool:
    name = type(exc).__name__.lower()
    msg = str(exc).lower()
    if "timeout" in name or "timeout" in msg or "timed out" in msg:
        return True
    if "connect" in name or "connection" in msg:
        return True
    # httpx HTTPStatusError etc.
    status = getattr(exc, "response", None)
    code = getattr(status, "status_code", None) if status is not None else None
    if code is None:
        code = getattr(exc, "status_code", None)
    if isinstance(code, int) and (code == 429 or code >= 500):
        return True
    return False


class FallbackProvider(LLMProvider):
    """Try primary then backups on 429/5xx/timeout/error responses."""

    def __init__(
        self,
        slots: list[ProviderSlot],
        *,
        on_switch: SwitchCallback | None = None,
        stats: FallbackStats | None = None,
    ) -> None:
        if not slots:
            raise ValueError("FallbackProvider requires at least one slot")
        self.slots = slots
        self.on_switch = on_switch
        self.stats = stats or FallbackStats()
        self.last_used: ProviderSlot = slots[0]
        self._pending_switches: list[dict[str, Any]] = []

    @property
    def primary(self) -> ProviderSlot:
        return self.slots[0]

    def drain_switches(self) -> list[dict[str, Any]]:
        out = list(self._pending_switches)
        self._pending_switches.clear()
        return out

    def used_meta(self) -> dict[str, Any]:
        slot = self.last_used
        return {
            "used_provider": slot.provider_name,
            "used_preset": slot.id,
            "used_label": slot.label,
            "used_backend": slot.backend,
            "used_model": slot.model,
            "fallback_chain": [s.id for s in self.slots],
        }

    def _emit_switch(self, *, frm: ProviderSlot, to: ProviderSlot, reason: str) -> None:
        from minibot.providers.fault_inject import classify_failover_reason

        entry = {
            "from": frm.id,
            "from_label": frm.label,
            "to": to.id,
            "to_label": to.label,
            "from_provider": frm.provider_name,
            "to_provider": to.provider_name,
            "reason": reason[:240],
            "reason_kind": classify_failover_reason(reason),
        }
        self.stats.record_switch(entry)
        self._pending_switches.append(entry)
        logger.info("provider fallback %s → %s (%s)", frm.id, to.id, reason[:120])
        if self.on_switch:
            try:
                self.on_switch(entry)
            except Exception:  # noqa: BLE001 — never break chat on toast failure
                logger.exception("on_switch callback failed")

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> LLMResponse:
        last_error: LLMResponse | None = None
        for i, slot in enumerate(self.slots):
            self.stats.attempts += 1
            use_model = slot.model or model
            try:
                resp = await slot.provider.chat(
                    messages,
                    tools=tools,
                    model=use_model,
                    temperature=temperature,
                )
            except Exception as exc:  # noqa: BLE001
                if not is_failover_exception(exc) or i >= len(self.slots) - 1:
                    raise
                reason = f"{type(exc).__name__}: {exc}"
                last_error = LLMResponse(content=reason, finish_reason="error")
                nxt = self.slots[i + 1]
                self._emit_switch(frm=slot, to=nxt, reason=reason)
                continue

            if is_failover_response(resp) and i < len(self.slots) - 1:
                last_error = resp
                nxt = self.slots[i + 1]
                self._emit_switch(
                    frm=slot,
                    to=nxt,
                    reason=resp.content or "error response",
                )
                continue

            self.last_used = slot
            self.stats.last_used = slot.id
            return resp

        self.last_used = self.slots[-1]
        self.stats.last_used = self.last_used.id
        return last_error or LLMResponse(content="All providers failed", finish_reason="error")

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> AsyncIterator[StreamEvent]:
        for i, slot in enumerate(self.slots):
            self.stats.attempts += 1
            use_model = slot.model or model
            emitted_any = False
            try:
                async for ev in slot.provider.chat_stream(
                    messages,
                    tools=tools,
                    model=use_model,
                    temperature=temperature,
                ):
                    if (
                        isinstance(ev, StreamEnd)
                        and ev.finish_reason == "error"
                        and not emitted_any
                        and i < len(self.slots) - 1
                    ):
                        nxt = self.slots[i + 1]
                        self._emit_switch(
                            frm=slot,
                            to=nxt,
                            reason=ev.content or "stream error",
                        )
                        break  # try next slot
                    if isinstance(ev, (TextDelta, ReasoningDelta, ToolCallDelta)):
                        emitted_any = True
                    if isinstance(ev, StreamEnd) or emitted_any:
                        self.last_used = slot
                        self.stats.last_used = slot.id
                    yield ev
                else:
                    # exhausted iterator without break → success path done
                    self.last_used = slot
                    self.stats.last_used = slot.id
                    return
                # broke to try next
                continue
            except Exception as exc:  # noqa: BLE001
                if emitted_any or not is_failover_exception(exc) or i >= len(self.slots) - 1:
                    if emitted_any:
                        yield StreamEnd(
                            finish_reason="error",
                            content=f"{type(exc).__name__}: {exc}",
                        )
                        return
                    raise
                nxt = self.slots[i + 1]
                self._emit_switch(frm=slot, to=nxt, reason=f"{type(exc).__name__}: {exc}")
                continue

        yield StreamEnd(finish_reason="error", content="All providers failed")
