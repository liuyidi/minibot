"""Automations / cron REST routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from minibot.api.deps import AuthDep, StateDep
from minibot.cron.types import CronSchedule

router = APIRouter(tags=["automations"])


def _require_cron(state: StateDep):
    if state.cron is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="cron not available")
    return state.cron


def _parse_schedule(raw: dict[str, Any] | None) -> CronSchedule:
    if not isinstance(raw, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="schedule object required")
    kind = str(raw.get("kind") or "").strip()
    if kind not in {"at", "every", "cron"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="schedule.kind must be at|every|cron")
    return CronSchedule(
        kind=kind,  # type: ignore[arg-type]
        at_ms=int(raw["at_ms"]) if raw.get("at_ms") is not None else None,
        every_ms=int(raw["every_ms"]) if raw.get("every_ms") is not None else None,
        expr=str(raw["expr"]).strip() if raw.get("expr") else None,
        tz=str(raw["tz"]).strip() if raw.get("tz") else None,
    )


@router.get("/api/webui/automations")
async def list_automations(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    cron = _require_cron(state)
    jobs = [cron.job_public(j) for j in cron.list_jobs(include_disabled=True)]
    return {"jobs": jobs, "status": cron.status()}


@router.post("/api/webui/automations")
async def create_automation(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cron = _require_cron(state)
    payload = body or {}
    name = str(payload.get("name") or "").strip() or "automation"
    session_id = str(payload.get("session_id") or "").strip()
    nested = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    message = str(payload.get("message") or nested.get("message") or "").strip()
    if not session_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="session_id required")
    if state.sessions.get(session_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
    schedule = _parse_schedule(payload.get("schedule") if isinstance(payload.get("schedule"), dict) else None)
    enabled = bool(payload.get("enabled", True))
    delete_after_run = bool(payload.get("delete_after_run", schedule.kind == "at"))
    try:
        job = cron.add_job(
            name=name,
            session_id=session_id,
            schedule=schedule,
            message=message,
            enabled=enabled,
            delete_after_run=delete_after_run,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"ok": True, "job": cron.job_public(job)}


@router.delete("/api/webui/automations/{job_id}")
async def delete_automation(_auth: AuthDep, state: StateDep, job_id: str) -> dict[str, Any]:
    cron = _require_cron(state)
    ok = cron.remove_job(job_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return {"ok": True, "deleted": job_id}


@router.post("/api/webui/automations/{job_id}/enable")
async def enable_automation(_auth: AuthDep, state: StateDep, job_id: str) -> dict[str, Any]:
    cron = _require_cron(state)
    job = cron.enable_job(job_id, True)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return {"ok": True, "job": cron.job_public(job)}


@router.post("/api/webui/automations/{job_id}/disable")
async def disable_automation(_auth: AuthDep, state: StateDep, job_id: str) -> dict[str, Any]:
    cron = _require_cron(state)
    job = cron.enable_job(job_id, False)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return {"ok": True, "job": cron.job_public(job)}


@router.post("/api/webui/automations/{job_id}/run")
async def run_automation(_auth: AuthDep, state: StateDep, job_id: str) -> dict[str, Any]:
    cron = _require_cron(state)
    job = await cron.run_job_now(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return {"ok": True, "job": cron.job_public(job)}


@router.get("/api/dev/cron")
async def dev_cron(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    cron = _require_cron(state)
    return {
        "ok": True,
        **cron.status(),
        "jobs": [cron.job_public(j) for j in cron.list_jobs(include_disabled=True)],
    }
