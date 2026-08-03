"""Human-in-the-loop approval REST API."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from minibot.api.deps import AuthDep, StateDep

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


class ApprovalDecision(BaseModel):
    decision: Literal["approve", "reject"]


@router.get("")
async def list_approvals(
    _auth: AuthDep,
    state: StateDep,
    session_id: str | None = None,
    pending_only: bool = False,
) -> dict:
    return {
        "approvals": [
            item.public()
            for item in state.approvals.list(session_id=session_id, pending_only=pending_only)
        ]
    }


@router.post("/{approval_id}/resolve")
async def resolve_approval(
    approval_id: str,
    body: ApprovalDecision,
    _auth: AuthDep,
    state: StateDep,
) -> dict:
    try:
        result = await state.loop.resolve_approval(
            approval_id, body.decision, bus=state.bus, channel="websocket"
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {
        "approval_id": approval_id,
        "content": result.content,
        "stop_reason": result.stop_reason,
        "tools_used": result.tools_used,
        "next_approval_id": result.approval_id,
    }
