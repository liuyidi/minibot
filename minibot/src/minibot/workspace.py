"""Workspace path helpers (Phase 0.5 skeleton)."""

from __future__ import annotations

from pathlib import Path


class WorkspaceError(ValueError):
    """Invalid workspace path."""


def default_workspace() -> Path:
    """Return the default agent workspace, aligned with nanobot's home layout.

    Default: ``{data_dir}/workspace`` → usually ``~/.minibot/workspace``.
    Creates the directory if missing (same idea as nanobot ``get_workspace_path``).
    """
    from minibot.config.settings import get_settings

    path = get_settings().data_dir.expanduser() / "workspace"
    path.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def normalize_workspace(raw: Path | str | None, *, must_exist: bool = True) -> Path:
    """Resolve to an absolute directory path.

    When ``must_exist`` is True (default for set/switch), the path must be an
    existing directory. Create-session defaults may pass ``None`` →
    ``default_workspace()`` (``~/.minibot/workspace``).
    """
    if raw is None or str(raw).strip() == "":
        path = default_workspace()
    else:
        path = Path(str(raw)).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        else:
            path = path.resolve()
    if must_exist:
        if not path.exists():
            raise WorkspaceError(f"workspace does not exist: {path}")
        if not path.is_dir():
            raise WorkspaceError(f"workspace is not a directory: {path}")
    return path
