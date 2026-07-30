"""Filesystem tools: read_file, write_file, edit_file, list_dir."""

from __future__ import annotations

import difflib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from minibot.agent.tools.base import Tool
from minibot.security.workspace_access import resolve_in_workspace

_QUOTE_TABLE = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
    }
)


def _normalize_quotes(s: str) -> str:
    return s.translate(_QUOTE_TABLE)


@dataclass(slots=True)
class _MatchSpan:
    start: int
    end: int
    text: str


def _find_exact_matches(content: str, old_text: str) -> list[_MatchSpan]:
    matches: list[_MatchSpan] = []
    start = 0
    while True:
        idx = content.find(old_text, start)
        if idx == -1:
            break
        matches.append(_MatchSpan(idx, idx + len(old_text), content[idx : idx + len(old_text)]))
        start = idx + max(1, len(old_text))
    return matches


def _find_trim_matches(content: str, old_text: str, *, normalize_quotes: bool = False) -> list[_MatchSpan]:
    old_lines = old_text.splitlines()
    if not old_lines:
        return []
    content_lines = content.splitlines()
    content_lines_keepends = content.splitlines(keepends=True)
    if len(content_lines) < len(old_lines):
        return []

    offsets: list[int] = []
    pos = 0
    for line in content_lines_keepends:
        offsets.append(pos)
        pos += len(line)
    offsets.append(pos)

    stripped_old = (
        [_normalize_quotes(line.strip()) for line in old_lines]
        if normalize_quotes
        else [line.strip() for line in old_lines]
    )
    matches: list[_MatchSpan] = []
    window_size = len(stripped_old)
    for i in range(len(content_lines) - window_size + 1):
        window = content_lines[i : i + window_size]
        comparable = (
            [_normalize_quotes(line.strip()) for line in window]
            if normalize_quotes
            else [line.strip() for line in window]
        )
        if comparable != stripped_old:
            continue
        start = offsets[i]
        end = offsets[i + window_size]
        if content_lines_keepends[i + window_size - 1].endswith("\n"):
            end -= 1
        matches.append(_MatchSpan(start, end, content[start:end]))
    return matches


def _find_quote_matches(content: str, old_text: str) -> list[_MatchSpan]:
    norm_content = _normalize_quotes(content)
    norm_old = _normalize_quotes(old_text)
    matches: list[_MatchSpan] = []
    start = 0
    while True:
        idx = norm_content.find(norm_old, start)
        if idx == -1:
            break
        matches.append(_MatchSpan(idx, idx + len(old_text), content[idx : idx + len(old_text)]))
        start = idx + max(1, len(norm_old))
    return matches


def _find_matches(content: str, old_text: str) -> list[_MatchSpan]:
    for matcher in (
        lambda: _find_exact_matches(content, old_text),
        lambda: _find_trim_matches(content, old_text),
        lambda: _find_trim_matches(content, old_text, normalize_quotes=True),
        lambda: _find_quote_matches(content, old_text),
    ):
        found = matcher()
        if found:
            return found
    return []


class ReadFileTool(Tool):
    name = "read_file"
    description = "Read a text file inside the workspace. Optional 1-based offset/limit for large files."
    risk = "low"
    source = "builtin"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path (relative to workspace or absolute within it)"},
                "offset": {"type": "integer", "description": "1-based start line", "minimum": 1},
                "limit": {"type": "integer", "description": "Max lines to return", "minimum": 1},
            },
            "required": ["path"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        path = resolve_in_workspace(str(kwargs.get("path", "")))
        if not path.is_file():
            return f"Error: not a file: {path}"
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        offset = int(kwargs.get("offset") or 1)
        limit = kwargs.get("limit")
        start = max(0, offset - 1)
        end = start + int(limit) if limit is not None else len(lines)
        chunk = lines[start:end]
        numbered = [f"{i + start + 1:>6}|{line}" for i, line in enumerate(chunk)]
        header = f"# {path.name} lines {start + 1}-{start + len(chunk)} of {len(lines)}\n"
        return header + "\n".join(numbered)


class WriteFileTool(Tool):
    name = "write_file"
    description = "Write (create/overwrite) a text file inside the workspace."
    risk = "high"
    source = "builtin"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        path = resolve_in_workspace(str(kwargs.get("path", "")))
        path.parent.mkdir(parents=True, exist_ok=True)
        content = str(kwargs.get("content", ""))
        path.write_text(content, encoding="utf-8")
        return f"Wrote {len(content)} chars to {path}"


class EditFileTool(Tool):
    name = "edit_file"
    description = (
        "Replace text in a workspace file. Matching: exact → trim → quote-normalized "
        "(same three-level strategy as nanobot)."
    )
    risk = "high"
    source = "builtin"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "old_text": {"type": "string"},
                "new_text": {"type": "string"},
                "replace_all": {"type": "boolean", "description": "Replace all matches (default false)"},
            },
            "required": ["path", "old_text", "new_text"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        path = resolve_in_workspace(str(kwargs.get("path", "")))
        if not path.is_file():
            return f"Error: not a file: {path}"
        content = path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
        old_text = str(kwargs.get("old_text", "")).replace("\r\n", "\n")
        new_text = str(kwargs.get("new_text", "")).replace("\r\n", "\n")
        replace_all = bool(kwargs.get("replace_all", False))
        matches = _find_matches(content, old_text)
        if not matches:
            close = difflib.get_close_matches(old_text[:80], content.splitlines(), n=3, cutoff=0.4)
            hint = f" Near lines: {close}" if close else ""
            return f"Error: old_text not found in {path}.{hint} Copy exact text from read_file."
        if len(matches) > 1 and not replace_all:
            return (
                f"Error: old_text matched {len(matches)} times in {path}. "
                "Pass replace_all=true or make old_text unique."
            )
        if replace_all:
            out = content
            for match in reversed(matches):
                out = out[: match.start] + new_text + out[match.end :]
            count = len(matches)
        else:
            match = matches[0]
            out = content[: match.start] + new_text + content[match.end :]
            count = 1
        path.write_text(out, encoding="utf-8")
        return f"Edited {path} ({count} replacement{'s' if count != 1 else ''})"


class ListDirTool(Tool):
    name = "list_dir"
    description = "List files and directories inside the workspace."
    risk = "low"
    source = "builtin"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path (default .)"},
                "recursive": {"type": "boolean"},
                "max_entries": {"type": "integer", "minimum": 1},
            },
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        root = resolve_in_workspace(str(kwargs.get("path") or "."))
        if not root.exists():
            return f"Error: path does not exist: {root}"
        if not root.is_dir():
            return f"Error: not a directory: {root}"
        recursive = bool(kwargs.get("recursive", False))
        max_entries = int(kwargs.get("max_entries") or 200)
        entries: list[str] = []
        if recursive:
            for p in sorted(root.rglob("*")):
                rel = p.relative_to(root)
                kind = "dir" if p.is_dir() else "file"
                entries.append(f"{kind}\t{rel}")
                if len(entries) >= max_entries:
                    break
        else:
            for p in sorted(root.iterdir()):
                kind = "dir" if p.is_dir() else "file"
                entries.append(f"{kind}\t{p.name}")
                if len(entries) >= max_entries:
                    break
        return "\n".join(entries) if entries else "(empty)"
