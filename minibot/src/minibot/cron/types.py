"""Cron job types (minibot MVP)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


@dataclass
class CronSchedule:
    kind: Literal["at", "every", "cron"]
    at_ms: int | None = None
    every_ms: int | None = None
    expr: str | None = None
    tz: str | None = None


@dataclass
class CronPayload:
    message: str = ""


@dataclass
class CronRunRecord:
    run_at_ms: int
    status: Literal["ok", "error", "skipped"]
    duration_ms: int = 0
    error: str | None = None


@dataclass
class CronJobState:
    next_run_at_ms: int | None = None
    last_run_at_ms: int | None = None
    last_status: Literal["ok", "error", "skipped"] | None = None
    last_error: str | None = None
    run_history: list[CronRunRecord] = field(default_factory=list)


@dataclass
class CronJob:
    id: str
    name: str
    session_id: str
    enabled: bool = True
    schedule: CronSchedule = field(default_factory=lambda: CronSchedule(kind="every", every_ms=60_000))
    payload: CronPayload = field(default_factory=CronPayload)
    state: CronJobState = field(default_factory=CronJobState)
    created_at_ms: int = 0
    updated_at_ms: int = 0
    delete_after_run: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> CronJob:
        sched = raw.get("schedule") or {"kind": "every", "every_ms": 60_000}
        payload = raw.get("payload") or {}
        state_raw = dict(raw.get("state") or {})
        history = []
        for item in state_raw.get("run_history") or []:
            if isinstance(item, CronRunRecord):
                history.append(item)
            else:
                history.append(CronRunRecord(**item))
        state_raw["run_history"] = history
        return cls(
            id=str(raw["id"]),
            name=str(raw.get("name") or raw["id"]),
            session_id=str(raw.get("session_id") or ""),
            enabled=bool(raw.get("enabled", True)),
            schedule=CronSchedule(**sched),
            payload=CronPayload(message=str(payload.get("message") or "")),
            state=CronJobState(**state_raw),
            created_at_ms=int(raw.get("created_at_ms") or 0),
            updated_at_ms=int(raw.get("updated_at_ms") or 0),
            delete_after_run=bool(raw.get("delete_after_run", False)),
        )


@dataclass
class CronStoreFile:
    version: int = 1
    jobs: list[CronJob] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"version": self.version, "jobs": [j.to_dict() for j in self.jobs]}

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> CronStoreFile:
        jobs = [CronJob.from_dict(j) for j in (raw.get("jobs") or [])]
        return cls(version=int(raw.get("version") or 1), jobs=jobs)
