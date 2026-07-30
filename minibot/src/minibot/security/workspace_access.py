"""Workspace path boundary for tools.

Application-level guard — not a replacement for an OS sandbox.
"""

from __future__ import annotations

from contextvars import ContextVar, Token
from pathlib import Path
from typing import Iterable

WORKSPACE_BOUNDARY_NOTE = (
    " (this is a hard policy boundary, not a transient failure; "
    "do not retry with shell tricks or alternative tools)"
)


class WorkspaceBoundaryError(PermissionError):
    """Raised when a path escapes the allowed workspace."""

    deny_reason = "workspace"


_workspace_var: ContextVar[Path | None] = ContextVar("minibot_tool_workspace", default=None)


def bind_workspace(workspace: str | Path) -> Token:
    return _workspace_var.set(Path(workspace).expanduser().resolve(strict=False))


def reset_workspace(token: Token) -> None:
    _workspace_var.reset(token)


def current_workspace(default: str | Path | None = None) -> Path:
    bound = _workspace_var.get()
    if bound is not None:
        return bound
    if default is not None:
        return Path(default).expanduser().resolve(strict=False)
    return Path.cwd().resolve(strict=False)


def is_path_within(path: str | Path, root: str | Path) -> bool:
    try:
        resolved_path = Path(path).expanduser().resolve(strict=False)
        resolved_root = Path(root).expanduser().resolve(strict=False)
        resolved_path.relative_to(resolved_root)
        return True
    except (OSError, RuntimeError, TypeError, ValueError):
        return False


def is_path_allowed(path: str | Path, roots: Iterable[str | Path]) -> bool:
    return any(is_path_within(path, root) for root in roots)


def resolve_in_workspace(
    path: str | Path,
    *,
    workspace: str | Path | None = None,
    extra_allowed: Iterable[str | Path] | None = None,
    must_exist: bool = False,
) -> Path:
    """Resolve *path* relative to workspace and require containment."""
    ws = current_workspace(workspace)
    candidate = Path(path).expanduser()
    if not candidate.is_absolute():
        candidate = ws / candidate
    resolved = candidate.resolve(strict=must_exist)
    roots = [ws, *(extra_allowed or [])]
    if not is_path_allowed(resolved, roots):
        raise WorkspaceBoundaryError(
            f"Path {path} is outside allowed directory {ws}" + WORKSPACE_BOUNDARY_NOTE
        )
    return resolved
