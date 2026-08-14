"""Misc compatibility routes for WebUI."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from minibot.api.deps import AuthDep, StateDep

router = APIRouter(tags=["misc"])

BUILTIN_SLASH_COMMANDS: list[dict[str, str]] = [
    {
        "command": "/compact",
        "title": "Compact history",
        "description": "Summarize older messages into session memory and keep recent turns.",
        "icon": "minimize-2",
        "arg_hint": "",
    },
]


@router.get("/api/commands")
async def list_commands(_auth: AuthDep) -> dict[str, list]:
    return {"commands": list(BUILTIN_SLASH_COMMANDS)}


@router.get("/api/webui/sidebar-state")
async def sidebar_state(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    from minibot.webui.sidebar_state import read_webui_sidebar_state

    return read_webui_sidebar_state(state.settings.data_dir)


def _persist_sidebar_state(data_dir: Any, decoded: dict[str, Any]) -> dict[str, Any]:
    from minibot.webui.sidebar_state import write_webui_sidebar_state

    try:
        return write_webui_sidebar_state(data_dir, decoded)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="failed to write sidebar state",
        ) from exc


@router.post("/api/webui/sidebar-state/update")
async def sidebar_state_update_post(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any],
) -> dict[str, Any]:
    """Persist sidebar workspace state via JSON body (preferred)."""
    return _persist_sidebar_state(state.settings.data_dir, body)


@router.get("/api/webui/sidebar-state/update")
async def sidebar_state_update_get(
    _auth: AuthDep,
    state: StateDep,
    state_json: str | None = Query(default=None, alias="state"),
) -> dict[str, Any]:
    """Legacy: state in query string. Prefer POST JSON body."""
    import json

    if state_json is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="missing state")
    try:
        decoded = json.loads(state_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="state must be JSON"
        ) from exc
    if not isinstance(decoded, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="state must be an object"
        )
    return _persist_sidebar_state(state.settings.data_dir, decoded)


def _webui_skills_workspace(state: StateDep) -> str | Path:
    from minibot.workspace import default_workspace

    workspace: str | Path = default_workspace()
    # Prefer newest session workspace when available (matches Chat).
    sessions = state.sessions.list()
    if sessions and sessions[0].workspace_path:
        workspace = sessions[0].workspace_path
    return workspace


@router.get("/api/webui/skills")
async def skills(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Installed skills (builtin + current default workspace overrides)."""
    from minibot.agent.skills import SkillsRegistry

    return SkillsRegistry(_webui_skills_workspace(state)).webui_list_payload()


@router.get("/api/webui/skills/{name}")
async def skill_detail(name: str, _auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Single skill detail for WebUI (requirements + raw SKILL.md)."""
    from minibot.agent.skills import SkillsRegistry

    reg = SkillsRegistry(_webui_skills_workspace(state))
    skill = reg.get(name)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    return reg.webui_detail(skill)


@router.post("/api/webui/skills")
async def install_skill(_auth: AuthDep, state: StateDep, body: dict[str, Any]) -> dict[str, Any]:
    """Install / overwrite a workspace skill from SKILL.md markdown."""
    from minibot.agent.skills import SkillsRegistry

    markdown = str(body.get("markdown") or "")
    name_raw = body.get("name")
    name = str(name_raw).strip() if name_raw is not None and str(name_raw).strip() else None
    reg = SkillsRegistry(_webui_skills_workspace(state))
    try:
        skill = reg.install_skill(markdown, name=name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="failed to write skill",
        ) from exc
    return reg.webui_detail(skill)


@router.get("/api/dev/providers")
async def dev_providers(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Dev UI: registry + active preset summary (keys masked)."""
    from minibot.config.presets import active_preset_summary, ensure_presets, presets_public_list
    from minibot.providers.registry import list_providers

    ensure_presets(state.config)
    impl = getattr(state.runner.provider, "__class__", type("X", (), {})).__name__
    return {
        "ok": True,
        "active": active_preset_summary(state.config),
        "presets": presets_public_list(state.config),
        "registry": list_providers(include_stubs=True),
        "implementation": impl,
        "runtime_class": f"{state.runner.provider.__class__.__module__}.{state.runner.provider.__class__.__name__}",
    }


@router.get("/api/dev/mcp")
async def dev_mcp(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Dev UI: MCP runtime snapshot + configured presets (headers masked)."""
    from minibot.config.mcp_presets import presets_public_list as mcp_presets_public_list, list_mcp_templates

    snap = state.mcp.snapshot()
    return {
        **snap,
        "presets": mcp_presets_public_list(state.config),
        "templates": list_mcp_templates(),
    }


@router.get("/api/dev/session-files")
async def session_files(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Dev UI helper: session JSONL files with created/updated timestamps."""
    store = state.sessions
    entries = store.list_disk_entries()
    return {
        "data_dir": str(store.data_dir),
        "sessions_dir": str(store.sessions_dir),
        "files": entries,
        "names": [e["name"] for e in entries],
    }


@router.post("/api/dev/session-files/delete")
async def delete_session_files(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dev UI: delete selected ``*.jsonl`` session files by basename."""
    from pathlib import Path

    store = state.sessions
    payload = body or {}
    raw = payload.get("files") or []
    if not isinstance(raw, list):
        raw = []
    allowed = {e["name"] for e in store.list_disk_entries()}
    deleted: list[str] = []
    skipped: list[str] = []
    for item in raw:
        name = Path(str(item)).name
        if not name.endswith(".jsonl") or name not in allowed:
            skipped.append(name)
            continue
        session_id = name[: -len(".jsonl")]
        if store.delete(session_id):
            deleted.append(name)
        else:
            skipped.append(name)
    entries = store.list_disk_entries()
    return {
        "deleted": deleted,
        "skipped": skipped,
        "files": entries,
        "names": [e["name"] for e in entries],
        "sessions_dir": str(store.sessions_dir),
        "data_dir": str(store.data_dir),
    }


@router.get("/api/dev/runtime")
async def runtime(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Dev UI helper: AgentLoop lock + MessageBus depths/timeline."""
    snap = state.loop.runtime_snapshot()
    worker = state.bus_worker.status() if state.bus_worker is not None else {}
    snap["bus"] = state.bus.snapshot(worker=worker)
    snap["fallback"] = _fallback_runtime_payload(state)
    return snap


def _fallback_runtime_payload(state: Any) -> dict[str, Any]:
    from minibot.config.presets import ensure_presets, find_preset
    from minibot.providers.fault_inject import FAILOVER_RULES, FAULT_MODES
    from minibot.providers.fallback import FallbackProvider

    ensure_presets(state.config)
    stats = state.fallback_stats
    provider = state.runner.provider
    chain: list[dict[str, Any]] = []
    if isinstance(provider, FallbackProvider):
        for s in provider.slots:
            chain.append(
                {
                    "id": s.id,
                    "label": s.label,
                    "provider": s.provider_name,
                    "backend": s.backend,
                    "model": s.model,
                }
            )
    else:
        active = find_preset(state.config, state.config.active_preset)
        chain.append(
            {
                "id": state.config.active_preset,
                "label": (active.label if active else "") or state.config.active_preset,
                "provider": state.config.provider,
                "backend": type(provider).__name__,
                "model": state.config.model,
            }
        )
        for fid in list(getattr(active, "fallback", None) or []) if active else []:
            p = find_preset(state.config, fid)
            if p is None:
                continue
            chain.append(
                {
                    "id": p.id,
                    "label": p.label or p.id,
                    "provider": p.provider,
                    "backend": "(not wrapped — activate after setting fallback)",
                    "model": p.model,
                    "pending": True,
                }
            )

    recent = []
    for e in stats.recent[:10]:
        recent.append(dict(e))

    return {
        "attempts": stats.attempts,
        "switches": stats.switches,
        "last_used": stats.last_used,
        "last_switch": stats.last_switch,
        "recent": recent,
        "active_is_fallback": isinstance(provider, FallbackProvider),
        "chain": chain,
        "rules": list(FAILOVER_RULES),
        "fault_modes": list(FAULT_MODES),
        "fault": state.fault_controller.snapshot(),
    }


@router.post("/api/dev/fallback/arm")
async def fallback_arm(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Arm primary-slot fault for next live chat / demo-turn (Dev Insight)."""
    payload = body or {}
    mode = str(payload.get("mode") or "soft_error").strip()
    oneshot = payload.get("oneshot", True)
    if isinstance(oneshot, str):
        oneshot = oneshot.lower() not in {"0", "false", "no"}
    try:
        snap = state.fault_controller.arm(mode, oneshot=bool(oneshot))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"ok": True, "fault": snap, "fallback": _fallback_runtime_payload(state)}


@router.post("/api/dev/fallback/disarm")
async def fallback_disarm(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    snap = state.fault_controller.disarm()
    return {"ok": True, "fault": snap, "fallback": _fallback_runtime_payload(state)}


@router.post("/api/dev/fallback/simulate")
async def fallback_simulate(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Offline probe: Fake primary fails with mode → backup succeeds; records into live stats."""
    from minibot.providers.fault_inject import FAULT_MODES, simulate_fallback_chain

    payload = body or {}
    mode = str(payload.get("mode") or "soft_error").strip()
    if mode not in FAULT_MODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unknown mode {mode!r}; choose from {list(FAULT_MODES)}",
        )
    # Record into live fallback_stats so Runtime panel updates (Insight DoD).
    result = await simulate_fallback_chain(mode=mode, stats=state.fallback_stats)  # type: ignore[arg-type]
    return {
        "ok": True,
        **result,
        "fallback": _fallback_runtime_payload(state),
    }


@router.post("/api/dev/fallback/probe-live")
async def fallback_probe_live(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Arm fault (optional) then run a Loop demo turn on the live provider chain."""
    payload = body or {}
    mode = payload.get("mode")
    if mode:
        try:
            state.fault_controller.arm(str(mode).strip(), oneshot=True)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    session = state.sessions.create(title="fallback-probe")
    content = str(payload.get("content") or "fallback probe").strip() or "fallback probe"
    try:
        result = await state.loop.handle_turn(session.id, content, entry="dev")
    except Exception as exc:
        from minibot.observability.usage_budget import BudgetExceeded

        if isinstance(exc, BudgetExceeded):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"error": "budget_exceeded", "reason": exc.reason, "usage": exc.snapshot},
            ) from exc
        raise
    used = {}
    provider = state.runner.provider
    if hasattr(provider, "used_meta"):
        used = provider.used_meta()  # type: ignore[union-attr]
    return {
        "ok": True,
        "session_id": session.id,
        "content": result.content,
        "stop_reason": result.stop_reason,
        "used": used,
        "fallback": _fallback_runtime_payload(state),
    }


@router.post("/api/dev/runtime/demo-turn")
async def runtime_demo_turn(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dev-only: exercise ``loop.handle_turn`` (sync path, bypasses bus)."""
    payload = body or {}
    session_id = str(payload.get("session_id") or "").strip()
    content = str(payload.get("content") or "runtime demo turn").strip() or "runtime demo turn"
    if not session_id:
        session = state.sessions.create(title="runtime-demo")
        session_id = session.id
    elif state.sessions.get(session_id) is None:
        state.sessions.create(session_id=session_id, title="runtime-demo")

    try:
        result = await state.loop.handle_turn(session_id, content, entry="dev")
    except Exception as exc:
        from minibot.observability.usage_budget import BudgetExceeded

        if isinstance(exc, BudgetExceeded):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"error": "budget_exceeded", "reason": exc.reason, "usage": exc.snapshot},
            ) from exc
        raise
    snap = state.loop.runtime_snapshot()
    worker = state.bus_worker.status() if state.bus_worker is not None else {}
    snap["bus"] = state.bus.snapshot(worker=worker)
    snap["fallback"] = _fallback_runtime_payload(state)
    return {
        "session_id": session_id,
        "content": result.content,
        "stop_reason": result.stop_reason,
        "runtime": snap,
    }


@router.post("/api/dev/bus/pause")
async def bus_pause(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Dev-only abnormal: pause inbound consumer so queue can pile up."""
    if state.bus_worker is None:
        return {"ok": False, "detail": "no bus worker"}
    state.bus_worker.paused = True
    return {"ok": True, "paused": True, "bus": state.bus.snapshot(worker=state.bus_worker.status())}


@router.post("/api/dev/bus/resume")
async def bus_resume(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    if state.bus_worker is None:
        return {"ok": False, "detail": "no bus worker"}
    state.bus_worker.paused = False
    return {"ok": True, "paused": False, "bus": state.bus.snapshot(worker=state.bus_worker.status())}


@router.post("/api/dev/bus/inject")
async def bus_inject(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dev-only: publish inbound without WS (for queue / timeline demos)."""
    from minibot.bus.events import InboundMessage

    payload = body or {}
    content = str(payload.get("content") or "bus inject").strip() or "bus inject"
    session_id = str(payload.get("session_id") or "").strip()
    if not session_id:
        session = state.sessions.create(title="bus-inject")
        session_id = session.id
    elif state.sessions.get(session_id) is None:
        state.sessions.create(session_id=session_id, title="bus-inject")

    await state.bus.publish_inbound(
        InboundMessage(
            channel="dev",
            sender_id="devui",
            chat_id=session_id,
            content=content,
            user_id=state.current_user_id(),
        )
    )
    worker = state.bus_worker.status() if state.bus_worker is not None else {}
    return {
        "ok": True,
        "session_id": session_id,
        "bus": state.bus.snapshot(worker=worker),
    }


@router.get("/api/dev/tools")
async def dev_tools(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Dev UI: registered tools + recent invocations (incl. security denies)."""
    snap = state.tools.snapshot()
    subagents: list[dict[str, Any]] = []
    for session in state.sessions.list():
        if "/sub/" not in session.id:
            continue
        parent_id = session.id.rsplit("/sub/", 1)[0]
        subagents.append(
            {
                "id": session.id,
                "parent_id": parent_id,
                "title": session.title,
                "updated_at": session.updated_at,
                "message_count": len(session.messages),
            }
        )
    snap["subagents"] = subagents
    return snap


def _resolve_session_workspace(
    state: StateDep,
    session_id: str = "",
) -> tuple[str | None, str | None, list[dict[str, Any]]]:
    """Return (session_id, workspace_path, sessions_meta). session_id may be None."""
    from minibot.workspace import default_workspace

    sessions_meta = [
        {
            "id": s.id,
            "title": s.title,
            "message_count": len(s.messages),
            "workspace_path": s.workspace_path,
        }
        for s in state.sessions.list()[:40]
    ]
    sid = (session_id or "").strip() or None
    if sid:
        session = state.sessions.get(sid)
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
        return sid, session.workspace_path or str(default_workspace()), sessions_meta
    if sessions_meta:
        first = sessions_meta[0]
        return first["id"], first.get("workspace_path") or str(default_workspace()), sessions_meta
    return None, str(default_workspace()), sessions_meta


@router.get("/api/dev/context")
async def dev_context(
    _auth: AuthDep,
    state: StateDep,
    session_id: str = "",
) -> dict[str, Any]:
    """Dev UI: assembled system prompt preview + compaction log (Phase 3a)."""
    sid = (session_id or "").strip()
    if not sid:
        # Default to most recently updated session if any
        sessions = state.sessions.list()
        if not sessions:
            return {
                "ok": False,
                "detail": "no sessions; create one in Chat first",
                "sessions": [],
            }
        sid = sessions[0].id
    try:
        snap = state.loop.context_snapshot(sid)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found") from None
    snap["ok"] = True
    snap["sessions"] = [
        {"id": s.id, "title": s.title, "message_count": len(s.messages)}
        for s in state.sessions.list()[:40]
    ]
    return snap


@router.get("/api/dev/memory")
async def dev_memory(
    _auth: AuthDep,
    state: StateDep,
    session_id: str = "",
) -> dict[str, Any]:
    """Dev UI: MEMORY.md full text for a session workspace (or default)."""
    from datetime import datetime, timezone

    from minibot.agent.memory import read_memory

    sid, workspace, sessions_meta = _resolve_session_workspace(state, session_id)
    snap = read_memory(workspace, limit=64_000)
    mtime_iso = None
    if snap.mtime is not None:
        mtime_iso = datetime.fromtimestamp(snap.mtime, tz=timezone.utc).isoformat()
    return {
        "ok": True,
        "session_id": sid,
        "workspace_path": workspace,
        "exists": snap.exists and bool(snap.text),
        "path": snap.path,
        "chars": snap.chars,
        "mtime": mtime_iso,
        "text": snap.text,
        "sessions": sessions_meta,
    }


@router.post("/api/dev/memory")
async def dev_memory_write(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dev UI: write MEMORY.md (replace|append) for quick debugging."""
    from minibot.agent.memory import read_memory, write_memory

    payload = body or {}
    sid, workspace, sessions_meta = _resolve_session_workspace(
        state, str(payload.get("session_id") or "")
    )
    mode = str(payload.get("mode") or "replace").strip().lower()
    if mode not in {"replace", "append"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mode must be replace|append")
    content = str(payload.get("content") or "")
    msg = write_memory(content, workspace, mode=mode)
    snap = read_memory(workspace, limit=64_000)
    return {
        "ok": True,
        "message": msg,
        "session_id": sid,
        "workspace_path": workspace,
        "exists": snap.exists and bool(snap.text),
        "path": snap.path,
        "chars": snap.chars,
        "text": snap.text,
        "sessions": sessions_meta,
    }


@router.get("/api/dev/knowledge/status")
async def dev_knowledge_status(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Dev UI: minikb connection status and configuration (key masked)."""
    from minibot.knowledge.client import get_kb_client

    base = (state.settings.minikb_base_url or "").strip()
    client = get_kb_client()
    if not base:
        return {
            "ok": False,
            "configured": False,
            "detail": "MINIBOT_SERVER_MINIKB_BASE_URL not set",
            "base_url": None,
            "api_key_masked": None,
        }
    health_ok = False
    detail = "unknown"
    if client is not None:
        try:
            await client._request("GET", "/health")
            health_ok = True
            detail = "healthy"
        except Exception as exc:
            detail = str(exc)
    key = state.settings.minikb_api_key or ""
    masked = None
    if key:
        if len(key) <= 8:
            masked = "***"
        else:
            masked = key[:4] + "***" + key[-4:]
    return {
        "ok": health_ok,
        "configured": True,
        "base_url": base,
        "api_key_masked": masked,
        "detail": detail,
    }


@router.get("/api/dev/knowledge/kbs")
async def dev_knowledge_kbs(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Dev UI: list knowledge bases from minikb (forwarded)."""
    from minibot.knowledge.client import get_kb_client

    client = get_kb_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="minikb not configured; set MINIBOT_SERVER_MINIKB_BASE_URL",
        )
    try:
        items = await client.list_kbs()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"minikb list failed: {exc}",
        ) from exc
    return {"ok": True, "kbs": items, "total": len(items)}


@router.get("/api/dev/knowledge/{kb_id}")
async def dev_knowledge_detail(
    _auth: AuthDep,
    state: StateDep,
    kb_id: str,
) -> dict[str, Any]:
    """Dev UI: single KB summary from minikb (forwarded)."""
    from minibot.knowledge.client import get_kb_client

    client = get_kb_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="minikb not configured",
        )
    try:
        all_items = await client.list_kbs()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"minikb list failed: {exc}",
        ) from exc
    match = next((i for i in all_items if i.get("id") == kb_id), None)
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"kb not found: {kb_id}",
        )
    return {"ok": True, "kb": match}


@router.post("/api/dev/knowledge/{kb_id}/search")
async def dev_knowledge_search(
    _auth: AuthDep,
    state: StateDep,
    kb_id: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dev UI: retrieve chunks from a KB (forwarded)."""
    from minibot.knowledge.client import get_kb_client

    client = get_kb_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="minikb not configured",
        )
    payload = body or {}
    query = str(payload.get("query") or "").strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="query is required",
        )
    top_k = min(int(payload.get("top_k") or 5), 20)
    mode = str(payload.get("mode") or "hybrid")
    if mode not in ("vector", "keyword", "hybrid"):
        mode = "hybrid"
    try:
        hits = await client.retrieve(kb_id, query, top_k=top_k, mode=mode)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"minikb retrieve failed: {exc}",
        ) from exc
    return {"ok": True, "kb_id": kb_id, "query": query, "mode": mode, "hits": hits}


@router.post("/api/dev/knowledge/{kb_id}/qa")
async def dev_knowledge_qa(
    _auth: AuthDep,
    state: StateDep,
    kb_id: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dev UI: RAG answer from a KB (forwarded)."""
    from minibot.knowledge.client import get_kb_client

    client = get_kb_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="minikb not configured",
        )
    payload = body or {}
    query = str(payload.get("query") or "").strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="query is required",
        )
    top_k = min(int(payload.get("top_k") or 6), 20)
    try:
        result = await client.qa(kb_id, query, top_k=top_k, mode="hybrid")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"minikb qa failed: {exc}",
        ) from exc
    return {"ok": True, "kb_id": kb_id, "query": query, **result}


@router.get("/api/dev/skills")
async def dev_skills(
    _auth: AuthDep,
    state: StateDep,
    session_id: str = "",
    name: str = "",
) -> dict[str, Any]:
    """Dev UI: skills list (+ optional single skill body by name)."""
    from minibot.agent.skills import SkillsRegistry

    sid, workspace, sessions_meta = _resolve_session_workspace(state, session_id)
    reg = SkillsRegistry(workspace)
    payload = reg.api_payload(include_body=False)
    selected = (name or "").strip()
    detail = None
    if selected:
        match = next((s for s in reg.list_skills() if s.name == selected), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"skill not found: {selected}")
        detail = {
            "name": match.name,
            "description": match.description,
            "always": match.always,
            "source": match.source,
            "path": match.path,
            "body": match.body,
            "body_chars": len(match.body),
        }
    return {
        "ok": True,
        "session_id": sid,
        "workspace_path": workspace,
        **payload,
        "detail": detail,
        "sessions": sessions_meta,
    }


@router.post("/api/dev/tools/deny-demo")
async def tools_deny_demo(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Abnormal DoD: force a workspace / SSRF / spawn-depth denial without LLM.

    Does **not** create a chat session — only binds the default workspace for the call.
    """
    from minibot.agent.tools import spawn as spawn_mod
    from minibot.security.workspace_access import bind_workspace, reset_workspace
    from minibot.workspace import default_workspace

    payload = body or {}
    kind = str(payload.get("kind") or "workspace").strip().lower()
    workspace_path = str(default_workspace())
    token = bind_workspace(workspace_path)
    denied_reason: str | None
    try:
        if kind == "ssrf":
            result = await state.tools.execute("web_fetch", {"url": "http://169.254.169.254/"})
            denied_reason = "ssrf"
        elif kind == "spawn_depth":
            depth_token = spawn_mod._depth.set(2)
            try:
                result = await state.tools.execute("spawn", {"task": "should be denied"})
            finally:
                spawn_mod._depth.reset(depth_token)
            denied_reason = "spawn_depth"
        else:
            result = await state.tools.execute("read_file", {"path": "/etc/passwd"})
            denied_reason = "workspace"
    finally:
        reset_workspace(token)

    ok = not str(result).startswith("Error:")
    snap = state.tools.snapshot()
    snap["subagents"] = [
        {
            "id": s.id,
            "parent_id": s.id.rsplit("/sub/", 1)[0],
            "title": s.title,
            "updated_at": s.updated_at,
            "message_count": len(s.messages),
        }
        for s in state.sessions.list()
        if "/sub/" in s.id
    ]
    return {
        "kind": kind,
        "ok": ok,
        "denied_reason": None if ok else denied_reason,
        "result": result,
        "session_id": None,
        "workspace_path": workspace_path,
        "tools": snap,
    }


@router.post("/api/dev/race")
async def race_demo(
    _auth: AuthDep,
    state: StateDep,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dev-only destructive demo: concurrent turns with/without session lock."""
    from minibot.devtools.race_demo import run_session_race

    payload = body or {}
    mode = str(payload.get("mode") or "unsafe").strip().lower()
    if mode not in {"unsafe", "safe"}:
        mode = "unsafe"
    concurrency = int(payload.get("concurrency") or 2)
    return await run_session_race(
        store=state.sessions,
        loop=state.loop,
        mode=mode,  # type: ignore[arg-type]
        concurrency=concurrency,
    )
