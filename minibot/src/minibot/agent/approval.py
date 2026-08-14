"""Human-in-the-loop approval policy and durable pending approvals."""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


def _now_ms() -> int:
    return int(time.time() * 1000)


# Absolute roots / homes that mean "outside the agent workspace".
_ABS_ESCAPE_ROOTS = (
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/var",
    "/opt",
    "/home",
    "/Users",
    "/root",
    "/System",
    "/Library",
    "/private",
    "/Applications",
)
_ESCAPE_TOKENS = re.compile(
    r"(?i)(^|[\s;&|])("
    r"sudo|doas|"
    r"systemctl|launchctl|"
    r"mkfs(\.\w+)?|"
    r"reboot|shutdown|poweroff|"
    r"chmod|chown"
    r")([\s;&|]|$)"
)
_PIPE_TO_SHELL = re.compile(r"(?i)\|\s*(?:ba)?sh\b|\|\s*zsh\b|\|\s*python(?:3)?\b")
_CURL_PIPE = re.compile(r"(?i)\b(curl|wget)\b[^|\n]*\|")
_RM_ROOT = re.compile(r"(?i)\brm\s+(-[^\s]*\s+)*(/|/\*|~(/|$)|\$HOME\b)")
_CD_OUT = re.compile(r"(?i)(^|[\s;&|])cd\s+(?:/|~|\$HOME\b)")
_HOME_REF = re.compile(r"(?:(?<![\w/])~(?:/|$)|\$HOME\b)")


def command_escapes_sandbox(command: str, *, workspace: Path | None = None) -> bool:
    """Return True when a shell command likely leaves the workspace / sandbox.

    This is a heuristic gate for HITL — not a substitute for OS isolation (bwrap/E2B).
    Relative workspace work (``ls``, ``pytest``, ``python script.py``) returns False.
    """
    text = (command or "").strip()
    if not text:
        return False

    if _ESCAPE_TOKENS.search(text) or _PIPE_TO_SHELL.search(text) or _CURL_PIPE.search(text):
        return True
    if _RM_ROOT.search(text) or _CD_OUT.search(text) or _HOME_REF.search(text):
        return True

    ws = None
    if workspace is not None:
        try:
            ws = Path(workspace).expanduser().resolve(strict=False)
        except (OSError, RuntimeError, ValueError):
            ws = None

    for match in re.finditer(r"(?<![\w.-])(/[^\s;|&]+)", text):
        raw = match.group(1)
        try:
            path = Path(raw).expanduser()
            if not path.is_absolute():
                continue
            resolved = path.resolve(strict=False)
        except (OSError, RuntimeError, ValueError):
            if any(raw == root or raw.startswith(root + "/") for root in _ABS_ESCAPE_ROOTS):
                return True
            continue
        if ws is not None:
            try:
                resolved.relative_to(ws)
                continue
            except ValueError:
                return True
        if any(str(resolved) == root or str(resolved).startswith(root + "/") for root in _ABS_ESCAPE_ROOTS):
            return True
        if ws is None:
            return True

    return False


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
    """Boundary-based HITL: workspace work is free; sandbox-escape exec is gated.

    MCP trust is deferred — all MCP tools are trusted for now (no per-call approval).
    """

    def __init__(self, auto_approve_channels: frozenset[str] | set[str] | None = None) -> None:
        self.auto_approve_channels = frozenset(auto_approve_channels or ())

    def check(self, tool: Any, arguments: dict[str, Any]) -> tuple[bool, str, str]:
        name = str(getattr(tool, "name", ""))
        mode = str(getattr(tool, "approval_mode", "policy"))
        risk = str(getattr(tool, "risk", "unknown"))
        from minibot.security.channel_context import current_channel

        if current_channel() in self.auto_approve_channels:
            return False, "", risk
        if mode == "never":
            return False, "", risk
        if mode == "always":
            return True, f"{name} requires explicit approval.", risk

        if name == "exec":
            command = str(arguments.get("command") or arguments.get("cmd") or "")
            from minibot.security.workspace_access import current_workspace

            try:
                workspace = current_workspace()
            except Exception:  # noqa: BLE001
                workspace = None
            if command_escapes_sandbox(command, workspace=workspace):
                return (
                    True,
                    "exec command appears to leave the workspace/sandbox boundary.",
                    risk if risk in {"critical", "high"} else "critical",
                )
            return False, "", risk

        # write_file / edit_file / write_memory / MCP / read-only tools: allow by default.
        return False, "", risk
