"""Workspace long-term memory: ``memory/MEMORY.md``."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from minibot.security.workspace_access import current_workspace


@dataclass(frozen=True)
class MemorySnapshot:
    text: str
    path: str
    exists: bool
    mtime: float | None
    chars: int


def memory_file(workspace: Path | str | None = None) -> Path:
    root = Path(workspace) if workspace is not None else current_workspace()
    return Path(root).expanduser().resolve(strict=False) / "memory" / "MEMORY.md"


def read_memory(workspace: Path | str | None = None, *, limit: int = 16_000) -> MemorySnapshot:
    path = memory_file(workspace)
    if not path.is_file():
        return MemorySnapshot(text="", path=str(path), exists=False, mtime=None, chars=0)
    try:
        text = path.read_text(encoding="utf-8")
        mtime = path.stat().st_mtime
    except OSError:
        return MemorySnapshot(text="", path=str(path), exists=False, mtime=None, chars=0)
    text = text.strip()
    if len(text) > limit:
        text = text[:limit] + "\n…(truncated)"
    return MemorySnapshot(
        text=text,
        path=str(path),
        exists=True,
        mtime=mtime,
        chars=len(text),
    )


def write_memory(content: str, workspace: Path | str | None = None, *, mode: str = "replace") -> str:
    """Write MEMORY.md. ``mode``: replace | append."""
    path = memory_file(workspace)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = (content or "").strip()
    if mode == "append":
        existing = ""
        if path.is_file():
            try:
                existing = path.read_text(encoding="utf-8").rstrip()
            except OSError:
                existing = ""
        if existing and body:
            body = f"{existing}\n\n{body}"
        elif existing:
            body = existing
    path.write_text(body + ("\n" if body else ""), encoding="utf-8")
    return f"Wrote {path} ({len(body)} chars, mode={mode})"
