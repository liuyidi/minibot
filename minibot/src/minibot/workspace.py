"""Workspace path helpers (Phase 0.5 skeleton)."""

from __future__ import annotations

from pathlib import Path


class WorkspaceError(ValueError):
    """Invalid workspace path."""


_BOOTSTRAP_SEED_FILES = ("SOUL.md", "HEARTBEAT.md")


def _template_dir() -> Path:
    return Path(__file__).resolve().parent / "templates"


def seed_workspace_bootstrap(workspace: Path) -> list[str]:
    """Copy packaged bootstrap templates when missing. Never overwrite existing files."""
    templates = _template_dir()
    written: list[str] = []
    for name in _BOOTSTRAP_SEED_FILES:
        dest = workspace / name
        if dest.exists():
            continue
        src = templates / name
        if not src.is_file():
            continue
        try:
            dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        except OSError:
            continue
        written.append(name)
    return written


def default_workspace() -> Path:
    """Return the default agent workspace, aligned with minibot's home layout.

    Default: ``{data_dir}/workspace`` → usually ``~/.minibot/workspace``.
    Creates the directory if missing (same idea as minibot ``get_workspace_path``).
    Seeds ``SOUL.md`` from package templates when absent.
    """
    from minibot.config.settings import get_settings

    path = get_settings().data_dir.expanduser() / "workspace"
    path.mkdir(parents=True, exist_ok=True)
    seed_workspace_bootstrap(path)
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
