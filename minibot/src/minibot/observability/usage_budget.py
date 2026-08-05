"""Daily LLM usage budget with kill-switch.

Limits are UTC calendar-day counters persisted under ``data_dir/usage/``.
``0`` means unlimited for that dimension.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("minibot.observability.usage_budget")


class BudgetExceeded(Exception):
    """Raised when a new turn would exceed the configured daily budget."""

    def __init__(self, reason: str, *, snapshot: dict[str, Any] | None = None) -> None:
        self.reason = reason
        self.snapshot = snapshot or {}
        super().__init__(f"LLM budget exceeded: {reason}")


def sum_usage_from_trace(trace: list[dict[str, Any]] | None) -> dict[str, int]:
    prompt = 0
    completion = 0
    if not trace:
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for step in trace:
        usage = step.get("usage") if isinstance(step, dict) else None
        if not isinstance(usage, dict):
            continue
        prompt += int(usage.get("prompt_tokens") or 0)
        completion += int(usage.get("completion_tokens") or 0)
    total = prompt + completion
    # Prefer explicit total when present on a single step; otherwise sum parts.
    for step in trace:
        usage = step.get("usage") if isinstance(step, dict) else None
        if isinstance(usage, dict) and usage.get("total_tokens") is not None:
            # Recompute from parts for multi-step accuracy.
            break
    return {"prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": total}


def _utc_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _empty_entry() -> dict[str, int]:
    return {"turns": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


@dataclass
class _DayState:
    date: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    turns: int = 0
    by_entry: dict[str, dict[str, int]] | None = None
    tripped: bool = False
    tripped_reason: str | None = None

    def __post_init__(self) -> None:
        if self.by_entry is None:
            self.by_entry = {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "date": self.date,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "turns": self.turns,
            "by_entry": self.by_entry or {},
            "tripped": self.tripped,
            "tripped_reason": self.tripped_reason,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> _DayState:
        by_raw = raw.get("by_entry") if isinstance(raw.get("by_entry"), dict) else {}
        by_entry: dict[str, dict[str, int]] = {}
        for key, val in by_raw.items():
            if isinstance(val, dict):
                by_entry[str(key)] = {
                    "turns": int(val.get("turns") or 0),
                    "prompt_tokens": int(val.get("prompt_tokens") or 0),
                    "completion_tokens": int(val.get("completion_tokens") or 0),
                    "total_tokens": int(val.get("total_tokens") or 0),
                }
        return cls(
            date=str(raw.get("date") or _utc_day()),
            prompt_tokens=int(raw.get("prompt_tokens") or 0),
            completion_tokens=int(raw.get("completion_tokens") or 0),
            total_tokens=int(raw.get("total_tokens") or 0),
            turns=int(raw.get("turns") or 0),
            by_entry=by_entry,
            tripped=bool(raw.get("tripped")),
            tripped_reason=str(raw["tripped_reason"]) if raw.get("tripped_reason") else None,
        )


class UsageBudget:
    """Process-local + disk-backed daily usage counters."""

    def __init__(
        self,
        data_dir: Path,
        *,
        daily_token_limit: int = 0,
        daily_turn_limit: int = 0,
    ) -> None:
        self.data_dir = Path(data_dir).expanduser()
        self.usage_dir = self.data_dir / "usage"
        self.daily_token_limit = max(0, int(daily_token_limit))
        self.daily_turn_limit = max(0, int(daily_turn_limit))
        self._lock = threading.Lock()
        self._state = self._load_today()

    def limits_enabled(self) -> bool:
        return self.daily_token_limit > 0 or self.daily_turn_limit > 0

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            self._refresh_day_unlocked()
            st = self._state
            return {
                "date": st.date,
                "timezone": "UTC",
                "limits": {
                    "daily_token_limit": self.daily_token_limit,
                    "daily_turn_limit": self.daily_turn_limit,
                    "enabled": self.limits_enabled(),
                },
                "totals": {
                    "prompt_tokens": st.prompt_tokens,
                    "completion_tokens": st.completion_tokens,
                    "total_tokens": st.total_tokens,
                    "turns": st.turns,
                },
                "by_entry": dict(st.by_entry or {}),
                "tripped": st.tripped,
                "tripped_reason": st.tripped_reason,
                "days": [
                    {
                        "date": st.date,
                        "prompt_tokens": st.prompt_tokens,
                        "completion_tokens": st.completion_tokens,
                        "total_tokens": st.total_tokens,
                        "turns": st.turns,
                    }
                ],
            }

    def is_tripped(self) -> bool:
        with self._lock:
            self._refresh_day_unlocked()
            if self._state.tripped:
                return True
            reason = self._limit_reason_unlocked()
            return reason is not None

    def check(self, *, entry: str = "unknown") -> None:
        del entry  # reserved for future per-entry quotas
        with self._lock:
            self._refresh_day_unlocked()
            reason = self._limit_reason_unlocked()
            if reason is None and not self._state.tripped:
                return
            if reason and not self._state.tripped:
                self._trip_unlocked(reason)
            raise BudgetExceeded(
                self._state.tripped_reason or reason or "budget",
                snapshot=self._public_unlocked(),
            )

    def record_turn(self, *, entry: str, usage: dict[str, Any] | None) -> None:
        entry_key = (entry or "unknown").strip() or "unknown"
        prompt = int((usage or {}).get("prompt_tokens") or 0)
        completion = int((usage or {}).get("completion_tokens") or 0)
        total = int((usage or {}).get("total_tokens") or (prompt + completion))
        with self._lock:
            self._refresh_day_unlocked()
            st = self._state
            st.turns += 1
            st.prompt_tokens += prompt
            st.completion_tokens += completion
            st.total_tokens += total
            bucket = st.by_entry.setdefault(entry_key, _empty_entry())
            bucket["turns"] += 1
            bucket["prompt_tokens"] += prompt
            bucket["completion_tokens"] += completion
            bucket["total_tokens"] += total
            reason = self._limit_reason_unlocked()
            if reason:
                self._trip_unlocked(reason)
            self._save_unlocked()

    def _public_unlocked(self) -> dict[str, Any]:
        st = self._state
        return {
            "date": st.date,
            "totals": {
                "prompt_tokens": st.prompt_tokens,
                "completion_tokens": st.completion_tokens,
                "total_tokens": st.total_tokens,
                "turns": st.turns,
            },
            "by_entry": dict(st.by_entry or {}),
            "tripped": st.tripped,
            "tripped_reason": st.tripped_reason,
            "limits": {
                "daily_token_limit": self.daily_token_limit,
                "daily_turn_limit": self.daily_turn_limit,
            },
        }

    def _limit_reason_unlocked(self) -> str | None:
        st = self._state
        if self.daily_turn_limit > 0 and st.turns >= self.daily_turn_limit:
            return "daily_turn_limit"
        if self.daily_token_limit > 0 and st.total_tokens >= self.daily_token_limit:
            return "daily_token_limit"
        return None

    def _trip_unlocked(self, reason: str) -> None:
        if self._state.tripped and self._state.tripped_reason:
            return
        self._state.tripped = True
        self._state.tripped_reason = reason
        log.warning(
            "LLM budget tripped reason=%s turns=%s tokens=%s limits turn=%s token=%s",
            reason,
            self._state.turns,
            self._state.total_tokens,
            self.daily_turn_limit,
            self.daily_token_limit,
        )
        self._save_unlocked()

    def _refresh_day_unlocked(self) -> None:
        today = _utc_day()
        if self._state.date != today:
            self._state = _DayState(date=today)
            self._save_unlocked()

    def _path_for(self, day: str) -> Path:
        return self.usage_dir / f"{day}.json"

    def _load_today(self) -> _DayState:
        today = _utc_day()
        path = self._path_for(today)
        if not path.is_file():
            return _DayState(date=today)
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return _DayState.from_dict(raw)
        except (OSError, json.JSONDecodeError) as exc:
            log.warning("failed to load usage budget %s: %s", path, exc)
        return _DayState(date=today)

    def _save_unlocked(self) -> None:
        path = self._path_for(self._state.date)
        try:
            self.usage_dir.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._state.to_dict(), indent=2) + "\n", encoding="utf-8")
            tmp.replace(path)
        except OSError as exc:
            log.warning("failed to persist usage budget %s: %s", path, exc)
