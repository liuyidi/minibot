"""Tools for long-term MEMORY.md read/write."""

from __future__ import annotations

from typing import Any

from minibot.agent.memory import read_memory, write_memory
from minibot.agent.tools.base import Tool


class ReadMemoryTool(Tool):
    name = "read_memory"
    description = (
        "Read long-term memory from workspace memory/MEMORY.md "
        "(facts, preferences, project notes)."
    )
    risk = "safe"
    source = "builtin"
    category = "misc"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        snap = read_memory()
        if not snap.exists or not snap.text:
            return "(memory/MEMORY.md is empty or missing)"
        return snap.text


class WriteMemoryTool(Tool):
    name = "write_memory"
    description = (
        "Write long-term memory to workspace memory/MEMORY.md. "
        "Use mode=replace to overwrite, or mode=append to add notes."
    )
    risk = "write"
    source = "builtin"
    category = "misc"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "Markdown content to store in MEMORY.md",
                },
                "mode": {
                    "type": "string",
                    "enum": ["replace", "append"],
                    "description": "replace (default) or append",
                },
            },
            "required": ["content"],
            "additionalProperties": False,
        }

    async def execute(self, content: str = "", mode: str = "replace", **kwargs: Any) -> str:
        m = (mode or "replace").strip().lower()
        if m not in {"replace", "append"}:
            return "Error: mode must be 'replace' or 'append'"
        return write_memory(content, mode=m)
