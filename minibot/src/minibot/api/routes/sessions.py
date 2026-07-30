"""Session REST routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from minibot.api.deps import AuthDep, StateDep
from minibot.workspace import WorkspaceError

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    title: str = ""
    workspace_path: str | None = None


class SessionSummary(BaseModel):
    id: str
    key: str
    title: str
    preview: str
    workspace_path: str
    created_at: str
    updated_at: str


class TurnRequest(BaseModel):
    content: str = Field(min_length=1)
    media: list[str] = Field(default_factory=list)


class TurnResponse(BaseModel):
    content: str
    tools_used: list[str]
    stop_reason: str
    messages: list[dict[str, Any]]
    trace: list[dict[str, Any]] = Field(default_factory=list)
    langfuse_trace_id: str = ""


class ScoreRequest(BaseModel):
    """User feedback for the latest (or specified) Langfuse trace."""

    value: float | None = None
    string_value: str | None = None
    name: str = "user-feedback"
    data_type: str = "BOOLEAN"
    comment: str | None = None
    trace_id: str | None = None



def _summary(session) -> SessionSummary:
    return SessionSummary(
        id=session.id,
        key=f"websocket:{session.id}",
        title=session.title,
        preview=session.preview(),
        workspace_path=session.workspace_path,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get("")
async def list_sessions(_auth: AuthDep, state: StateDep) -> dict[str, list[SessionSummary]]:
    return {"sessions": [_summary(s) for s in state.sessions.list()]}


@router.post("")
async def create_session(
    _auth: AuthDep,
    state: StateDep,
    body: SessionCreate | None = None,
) -> SessionSummary:
    body = body or SessionCreate()
    try:
        session = state.sessions.create(title=body.title, workspace=body.workspace_path)
    except WorkspaceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _summary(session)


@router.get("/{session_id}/messages")
async def get_messages(_auth: AuthDep, state: StateDep, session_id: str) -> dict[str, Any]:
    session = state.sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
    return {"session_id": session_id, "messages": session.messages}


@router.get("/{session_id}/context-usage")
async def session_context_usage(
    _auth: AuthDep,
    state: StateDep,
    session_id: str,
    draft: str = "",
) -> dict[str, Any]:
    """Claude-style context window breakdown (heuristic tokens)."""
    from minibot.agent.context import build_system_prompt
    from minibot.agent.tools.builtin import SYSTEM_PROMPT
    from minibot.context_estimate import build_context_usage, format_token_short

    sid = session_id.split(":", 1)[1] if session_id.startswith("websocket:") else session_id
    session = state.sessions.get(sid)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")

    window = int(getattr(state.config, "context_window_tokens", None) or 128_000)

    from minibot.agent.memory import read_memory
    from minibot.agent.skills import SkillsRegistry

    built = build_system_prompt(
        workspace=session.workspace_path,
        identity=state.loop.system_prompt or SYSTEM_PROMPT,
        session_summary=session.summary,
    )
    system_text = built.text
    mem = read_memory(session.workspace_path) if session.workspace_path else None
    skills_blob = ""
    if session.workspace_path:
        reg = SkillsRegistry(session.workspace_path)
        always = reg.load_always_bodies()
        catalog = reg.build_skills_summary(exclude={s.name for s in reg.always_skills()})
        skills_blob = "\n\n".join(p for p in (always, catalog) if p)

    payload = build_context_usage(
        messages=list(session.messages),
        system_prompt=system_text,
        tool_definitions=state.tools.get_definitions(),
        context_window_tokens=window,
        draft_text=draft,
        mcp_tool_definitions=[
            d
            for d in state.tools.get_definitions()
            if str((d.get("function") or {}).get("name") or "").startswith("mcp_")
        ],
        skills_text=skills_blob,
        memory_text=(mem.text if mem and mem.text else ""),
    )
    # Human-friendly labels for UI (keep raw ints too).
    for cat in payload["categories"]:
        cat["tokens_label"] = format_token_short(cat["tokens"])
    payload["used_label"] = format_token_short(payload["used_tokens"])
    payload["free_label"] = format_token_short(payload["free_tokens"])
    payload["window_label"] = format_token_short(payload["context_window_tokens"])
    payload["session_id"] = sid
    payload["model"] = state.config.model
    return payload


@router.get("/{session_id}/webui-thread")
async def get_webui_thread(_auth: AuthDep, state: StateDep, session_id: str) -> dict[str, Any]:
    """Compatibility shape for the WebUI transcript loader."""
    session = state.sessions.get(session_id)
    if session is None:
        # Also accept full key websocket:<id>
        if session_id.startswith("websocket:"):
            session = state.sessions.get(session_id.split(":", 1)[1])
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")

    ui_messages: list[dict[str, Any]] = []
    for idx, msg in enumerate(session.messages):
        role = msg.get("role")
        if role not in {"user", "assistant"}:
            continue
        content = msg.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        ui_messages.append(
            {
                "id": f"{session.id}-{idx}",
                "role": role,
                "content": content,
            }
        )
    return {
        "schemaVersion": 1,
        "sessionKey": f"websocket:{session.id}",
        "messages": ui_messages,
    }


@router.delete("/{session_id}")
@router.get("/{session_id}/delete")
async def delete_session(_auth: AuthDep, state: StateDep, session_id: str) -> dict[str, Any]:
    sid = session_id.split(":", 1)[1] if session_id.startswith("websocket:") else session_id
    ok = state.sessions.delete(sid)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
    return {"ok": True, "deleted": sid}


@router.post("/{session_id}/turns")
async def run_turn(
    _auth: AuthDep,
    state: StateDep,
    session_id: str,
    body: TurnRequest,
) -> TurnResponse:
    sid = session_id.split(":", 1)[1] if session_id.startswith("websocket:") else session_id
    if state.sessions.get(sid) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")

    try:
        result = await state.loop.handle_turn(sid, body.content, entry="rest")
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found") from None
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return TurnResponse(
        content=result.content,
        tools_used=result.tools_used,
        stop_reason=result.stop_reason,
        messages=result.messages,
        trace=result.trace,
        langfuse_trace_id=result.langfuse_trace_id or "",
    )


@router.post("/{session_id}/score")
async def score_session_turn(
    _auth: AuthDep,
    state: StateDep,
    session_id: str,
    body: ScoreRequest,
) -> dict[str, Any]:
    """Score the latest Langfuse trace for this session (👍/👎 from Dev UI)."""
    from minibot.observability import langfuse as lf

    sid = session_id.split(":", 1)[1] if session_id.startswith("websocket:") else session_id
    if state.sessions.get(sid) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")

    if not lf.is_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="langfuse is not enabled",
        )

    trace_id = (body.trace_id or "").strip() or state.loop.last_langfuse_trace_id(sid)
    if not trace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="no langfuse_trace_id for this session yet",
        )

    # Convenience: boolean thumbs without explicit value
    value = body.value
    string_value = body.string_value
    data_type = body.data_type
    if value is None and string_value is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="value or string_value required",
        )

    result = lf.score(
        trace_id=trace_id,
        name=body.name,
        value=value,
        string_value=string_value,
        data_type=data_type,
        comment=body.comment,
        source="API",
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="failed to post score to langfuse",
        )
    return {"ok": True, "trace_id": trace_id, "score": result}
