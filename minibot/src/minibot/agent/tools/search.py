"""Search tools: find_files + grep (ripgrep preferred, Python fallback)."""

from __future__ import annotations

import asyncio
import re
import shutil
from pathlib import Path
from typing import Any

from minibot.agent.tools.base import Tool
from minibot.security.workspace_access import resolve_in_workspace


def _has_rg() -> bool:
    return shutil.which("rg") is not None


class FindFilesTool(Tool):
    name = "find_files"
    description = "Find files under a workspace path by name substring or glob."
    risk = "low"
    source = "builtin"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Root directory (default .)"},
                "query": {"type": "string", "description": "Substring match on file name"},
                "glob": {"type": "string", "description": "Glob pattern e.g. **/*.py"},
                "head_limit": {"type": "integer", "minimum": 1},
            },
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        root = resolve_in_workspace(str(kwargs.get("path") or "."))
        if not root.is_dir():
            return f"Error: not a directory: {root}"
        query = (kwargs.get("query") or "").lower()
        pattern = kwargs.get("glob")
        limit = int(kwargs.get("head_limit") or 100)
        hits: list[str] = []
        iterator = root.rglob(pattern) if pattern else root.rglob("*")
        for path in iterator:
            if not path.is_file():
                continue
            name = path.name
            if query and query not in name.lower():
                continue
            hits.append(str(path.relative_to(root)))
            if len(hits) >= limit:
                break
        return "\n".join(hits) if hits else "(no matches)"


class GrepTool(Tool):
    name = "grep"
    description = "Search file contents with a regex/pattern inside the workspace."
    risk = "low"
    source = "builtin"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "pattern": {"type": "string"},
                "path": {"type": "string", "description": "File or directory (default .)"},
                "glob": {"type": "string"},
                "case_insensitive": {"type": "boolean"},
                "head_limit": {"type": "integer", "minimum": 1},
            },
            "required": ["pattern"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        pattern = str(kwargs.get("pattern", ""))
        root = resolve_in_workspace(str(kwargs.get("path") or "."))
        limit = int(kwargs.get("head_limit") or 50)
        case_insensitive = bool(kwargs.get("case_insensitive", False))
        glob = kwargs.get("glob")

        if _has_rg():
            return await self._rg(root, pattern, glob, case_insensitive, limit)
        return self._python_grep(root, pattern, glob, case_insensitive, limit)

    async def _rg(
        self,
        root: Path,
        pattern: str,
        glob: str | None,
        case_insensitive: bool,
        limit: int,
    ) -> str:
        cmd = ["rg", "--line-number", "--no-heading", "--color", "never", "-m", str(limit)]
        if case_insensitive:
            cmd.append("-i")
        if glob:
            cmd.extend(["--glob", str(glob)])
        cmd.extend(["--", pattern, str(root)])
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode not in (0, 1):
            err = stderr.decode("utf-8", errors="replace").strip()
            return f"Error: rg failed: {err or proc.returncode}"
        text = stdout.decode("utf-8", errors="replace").strip()
        return text or "(no matches)"

    def _python_grep(
        self,
        root: Path,
        pattern: str,
        glob: str | None,
        case_insensitive: bool,
        limit: int,
    ) -> str:
        flags = re.IGNORECASE if case_insensitive else 0
        try:
            regex = re.compile(pattern, flags)
        except re.error as exc:
            return f"Error: invalid pattern: {exc}"

        files: list[Path]
        if root.is_file():
            files = [root]
        else:
            files = list(root.rglob(glob)) if glob else [p for p in root.rglob("*") if p.is_file()]

        hits: list[str] = []
        for path in files:
            try:
                if path.stat().st_size > 2_000_000:
                    continue
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for i, line in enumerate(text.splitlines(), start=1):
                if regex.search(line):
                    rel = path if root.is_file() else path.relative_to(root)
                    hits.append(f"{rel}:{i}:{line[:240]}")
                    if len(hits) >= limit:
                        return "\n".join(hits)
        return "\n".join(hits) if hits else "(no matches)"
