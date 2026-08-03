"""Human-in-the-loop approval policy and durable pending approvals."""

from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


def _now_ms() -> int:
    return int(time.time() * 1000)


@dataclass(slots=True)
class PendingApproval:
    id: str
    session_id: str
    tool_calls: list[dict[str, Any]]
    continuation_messages: list[dict[str, Any]]
    reason: str
    risk: str
    created_at_ms: int
    expires_at_ms: int
    status: str = "pending"
    decision_at_ms: int | None = None

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "tool_calls": self.tool_calls,
            "reason": self.reason,
            "risk": self.risk,
            "created_at_ms": self.created_at_ms,
            "expires_at_ms": self.expires_at_ms,
            "status": self.status,
        }


class ApprovalStore:
    """One JSON record per approval, safe across process restarts."""

    def __init__(self, data_dir: Path, *, ttl_s: int = 900) -> None:
        self.directory = Path(data_dir) / "approvals"
        self.directory.mkdir(parents=True, exist_ok=True)
        self.ttl_s = ttl_s

    def create(
        self,
        *,
        session_id: str,
        tool_calls: list[dict[str, Any]],
        continuation_messages: list[dict[str, Any]],
        reason: str,
        risk: str,
    ) -> PendingApproval:
        now = _now_ms()
        approval = PendingApproval(
            id=f"apr_{uuid.uuid4().hex[:16]}",
            session_id=session_id,
            tool_calls=tool_calls,
            continuation_messages=continuation_messages,
            reason=reason,
            risk=risk,
            created_at_ms=now,
            expires_at_ms=now + self.ttl_s * 1000,
        )
        self._save(approval)
        return approval

    def get(self, approval_id: str) -> PendingApproval | None:
        path = self.directory / f"{approval_id}.json"
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            approval = PendingApproval(**raw)
        except (OSError, ValueError, TypeError):
            return None
        if approval.status == "pending" and approval.expires_at_ms < _now_ms():
            approval.status = "expired"
            approval.decision_at_ms = _now_ms()
            self._save(approval)
        return approval

    def list(self, *, session_id: str | None = None, pending_only: bool = False) -> list[PendingApproval]:
        out: list[PendingApproval] = []
        for path in self.directory.glob("apr_*.json"):
            approval = self.get(path.stem)
            if approval is None:
                continue
            if session_id and approval.session_id != session_id:
                continue
            if pending_only and approval.status != "pending":
                continue
            out.append(approval)
        return sorted(out, key=lambda item: item.created_at_ms, reverse=True)

    def decide(self, approval_id: str, decision: str) -> PendingApproval | None:
        approval = self.get(approval_id)
        if approval is None or approval.status != "pending":
            return approval
        approval.status = "approved" if decision == "approve" else "rejected"
        approval.decision_at_ms = _now_ms()
        self._save(approval)
        return approval

    def _save(self, approval: PendingApproval) -> None:
        path = self.directory / f"{approval.id}.json"
        tmp = path.with_suffix(".json.tmp")
        try:
            with tmp.open("w", encoding="utf-8") as f:
                json.dump(asdict(approval), f, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise


class ApprovalPolicy:
    """Conservative default: mutation, shell and MCP calls require a human."""

    _ALWAYS = {"exec", "write_file", "edit_file", "write_memory"}

    def check(self, tool: Any, arguments: dict[str, Any]) -> tuple[bool, str, str]:
        del arguments  # Reserved for future command/path-specific policies.
        name = str(getattr(tool, "name", ""))
        mode = str(getattr(tool, "approval_mode", "policy"))
        risk = str(getattr(tool, "risk", "unknown"))
        if mode == "always" or name in self._ALWAYS or str(getattr(tool, "source", "")) == "mcp":
            return True, f"{name} may modify local state or invoke an external capability.", risk
        return False, "", risk
