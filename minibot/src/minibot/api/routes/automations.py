"""Automations / cron REST routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from minibot.api.deps import AuthDep, StateDep
from minibot.cron.service import CronService, _bare_session_id
from minibot.cron.types import CronJob, CronSchedule, is_system_job

router = APIRouter(tags=["automations"])


def _require_cron(state: StateDep) -> CronService:
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


def _session_key(session_id: str) -> str:
    sid = (session_id or "").strip()
    if not sid:
        return ""
    return sid if ":" in sid else f"websocket:{sid}"


def _enrich_job(state: StateDep, cron: CronService, job: CronJob) -> dict[str, Any]:
    """Public job payload + WebUI ``origin`` for linked-chat actions."""
    d = cron.job_public(job)
    key = _session_key(job.session_id)
    bare = _bare_session_id(job.session_id)
    channel, _, chat_id = key.partition(":")
    if not chat_id:
        channel, chat_id = "websocket", bare
    session = state.sessions.get(bare) or state.sessions.get(job.session_id)
    title = ""
    preview = ""
    if session is not None:
        title = (getattr(session, "title", None) or "").strip()
        msgs = getattr(session, "messages", None) or []
        for msg in reversed(msgs):
            if isinstance(msg, dict) and msg.get("role") == "user":
                content = msg.get("content")
                if isinstance(content, str) and content.strip():
                    preview = content.strip()[:120]
                    break
    d["protected"] = is_system_job(job)
    if job.session_id.strip():
        d["origin"] = {
            "session_key": key,
            "channel": channel or "websocket",
            "chat_id": chat_id or bare,
            "title": title,
            "preview": preview,
        }
    else:
        d["origin"] = None
    # Ensure state.pending exists for WebUI gates (always false for file-backed jobs).
    state_obj = d.get("state")
    if isinstance(state_obj, dict) and "pending" not in state_obj:
        state_obj["pending"] = False
    return d


def _jobs_payload(state: StateDep, cron: CronService) -> dict[str, Any]:
    jobs = [_enrich_job(state, cron, j) for j in cron.list_jobs(include_disabled=True)]
    return {"jobs": jobs, "status": cron.status()}


def _jobs_for_session(state: StateDep, cron: CronService, session_id: str) -> list[dict[str, Any]]:
    bare = _bare_session_id(session_id)
    out: list[dict[str, Any]] = []
    for job in cron.list_jobs(include_disabled=True):
        if _bare_session_id(job.session_id) == bare:
            out.append(_enrich_job(state, cron, job))
    return out


@router.get("/api/webui/automations")
async def list_automations(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    cron = _require_cron(state)
    return _jobs_payload(state, cron)


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
    bare = _bare_session_id(session_id)
    if state.sessions.get(bare) is None and state.sessions.get(session_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
    schedule = _parse_schedule(payload.get("schedule") if isinstance(payload.get("schedule"), dict) else None)
    enabled = bool(payload.get("enabled", True))
    delete_after_run = bool(payload.get("delete_after_run", schedule.kind == "at"))
    try:
        job = cron.add_job(
            name=name,
            session_id=bare,
            schedule=schedule,
            message=message,
            enabled=enabled,
            delete_after_run=delete_after_run,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"ok": True, "job": _enrich_job(state, cron, job), **_jobs_payload(state, cron)}


@router.post("/api/webui/automations/{job_id}")
async def update_automation(
    _auth: AuthDep,
    state: StateDep,
    job_id: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Update name / message / schedule (JSON body; WebUI edit dialog)."""
    cron = _require_cron(state)
    payload = body or {}
    schedule = None
    if "schedule" in payload:
        schedule = _parse_schedule(payload.get("schedule") if isinstance(payload.get("schedule"), dict) else None)
    try:
        job = cron.update_job(
            job_id,
            name=str(payload["name"]) if payload.get("name") is not None else None,
            message=str(payload["message"]) if payload.get("message") is not None else None,
            schedule=schedule,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if job == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    if job == "protected":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="system automation is protected")
    return {"ok": True, "job": _enrich_job(state, cron, job), **_jobs_payload(state, cron)}


@router.delete("/api/webui/automations/{job_id}")
async def delete_automation(_auth: AuthDep, state: StateDep, job_id: str) -> dict[str, Any]:
    cron = _require_cron(state)
    result = cron.remove_job(job_id)
    if result == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    if result == "protected":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="system automation is protected")
    return {"ok": True, "deleted": job_id, **_jobs_payload(state, cron)}


@router.post("/api/webui/automations/{job_id}/enable")
async def enable_automation(_auth: AuthDep, state: StateDep, job_id: str) -> dict[str, Any]:
    cron = _require_cron(state)
    job = cron.enable_job(job_id, True)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return {"ok": True, "job": _enrich_job(state, cron, job), **_jobs_payload(state, cron)}


@router.post("/api/webui/automations/{job_id}/disable")
async def disable_automation(_auth: AuthDep, state: StateDep, job_id: str) -> dict[str, Any]:
    cron = _require_cron(state)
    job = cron.enable_job(job_id, False)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return {"ok": True, "job": _enrich_job(state, cron, job), **_jobs_payload(state, cron)}


@router.post("/api/webui/automations/{job_id}/run")
async def run_automation(_auth: AuthDep, state: StateDep, job_id: str) -> dict[str, Any]:
    cron = _require_cron(state)
    job = await cron.run_job_now(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return {"ok": True, "job": _enrich_job(state, cron, job), **_jobs_payload(state, cron)}


@router.get("/api/sessions/{session_id}/automations")
async def list_session_automations(
    _auth: AuthDep,
    state: StateDep,
    session_id: str,
) -> dict[str, Any]:
    cron = _require_cron(state)
    bare = _bare_session_id(session_id)
    if state.sessions.get(bare) is None and state.sessions.get(session_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
    return {"jobs": _jobs_for_session(state, cron, session_id)}


@router.get("/api/dev/cron")
async def dev_cron(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    cron = _require_cron(state)
    payload = _jobs_payload(state, cron)
    return {"ok": True, **payload["status"], "jobs": payload["jobs"]}
