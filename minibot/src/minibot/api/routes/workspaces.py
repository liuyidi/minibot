"""Workspace REST routes (Phase 0.5)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from minibot.api.deps import AuthDep, StateDep
from minibot.workspace import WorkspaceError, default_workspace, normalize_workspace

router = APIRouter(tags=["workspaces"])


class WorkspaceSetBody(BaseModel):
    workspace_path: str = Field(min_length=1)
    # Compatibility with minibot WebUI scope shape (optional).
    project_path: str | None = None
    access_mode: str = "restricted"


def _workspace_entry(path: str, *, is_default: bool = False) -> dict[str, Any]:
    p = path
    name = path.rstrip("/").rsplit("/", 1)[-1] or path
    return {
        "path": p,
        "name": name,
        "is_default": is_default,
        "exists": True,
    }


@router.get("/api/workspaces")
async def list_workspaces(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    """Return default cwd + unique workspace paths from sessions."""
    default = str(default_workspace())
    seen: dict[str, dict[str, Any]] = {
        default: _workspace_entry(default, is_default=True),
    }
    for session in state.sessions.list():
        path = session.workspace_path
        if path and path not in seen:
            exists = True
            try:
                normalize_workspace(path, must_exist=True)
            except WorkspaceError:
                exists = False
            entry = _workspace_entry(path, is_default=False)
            entry["exists"] = exists
            seen[path] = entry
    return {
        "workspaces": list(seen.values()),
        "default_workspace": default,
        "default_access_mode": "default",
        "default_scope": {
            "project_path": default,
            "access_mode": "restricted",
        },
        "controls": {
            # Browser WebUI ignores this and hides the picker without a native host.
            # Desktop (minibotHost) still uses it to allow local folder selection.
            "can_change_project": True,
            "can_use_full_access": True,
        },
    }


@router.post("/api/sessions/{session_id}/workspace")
async def set_session_workspace(
    _auth: AuthDep,
    state: StateDep,
    session_id: str,
    body: WorkspaceSetBody,
) -> dict[str, Any]:
    sid = session_id.split(":", 1)[1] if session_id.startswith("websocket:") else session_id
    if state.sessions.get(sid) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
    raw = (body.project_path or body.workspace_path or "").strip()
    try:
        session = state.sessions.set_workspace(sid, raw)
    except WorkspaceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found") from None
    return {
        "ok": True,
        "session_id": session.id,
        "workspace_path": session.workspace_path,
    }
