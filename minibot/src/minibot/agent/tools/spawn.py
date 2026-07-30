"""Sync spawn tool — nested AgentRunner, block until child finishes (Phase 1.5A)."""

from __future__ import annotations

import uuid
from contextvars import ContextVar
from typing import TYPE_CHECKING, Any

from minibot.agent.tools.base import Tool
from minibot.agent.tools.builtin import register_default_tools

if TYPE_CHECKING:
    from minibot.agent.loop import AgentLoop

# 0 = main agent; spawn allowed while depth < MAX_DEPTH before entering child.
_depth: ContextVar[int] = ContextVar("minibot_subagent_depth", default=0)
_parent_session_id: ContextVar[str | None] = ContextVar(
    "minibot_parent_session_id",
    default=None,
)

MAX_DEPTH = 2

SUBAGENT_SYSTEM = (
    "You are a minibot subagent. Complete the assigned task using available tools. "
    "Stay focused. Your final reply is returned to the parent agent. "
    "Respect the workspace boundary."
)


def current_depth() -> int:
    return _depth.get()


def bind_parent_session(session_id: str):
    return _parent_session_id.set(session_id)


def reset_parent_session(token: Any) -> None:
    _parent_session_id.reset(token)


class SpawnTool(Tool):
    name = "spawn"
    description = (
        "Spawn a subagent to complete a focused task. Blocks until the subagent "
        "finishes and returns its final answer. Use for parallelizable research "
        "or isolated coding subtasks. Nested spawn is limited (max depth 2)."
    )
    risk = "medium"
    source = "builtin"

    def __init__(self) -> None:
        self._loop: AgentLoop | None = None

    def bind_loop(self, loop: AgentLoop) -> None:
        self._loop = loop

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task for the subagent to complete",
                },
                "label": {
                    "type": "string",
                    "description": "Optional short label for display",
                },
            },
            "required": ["task"],
            "additionalProperties": False,
        }

    async def execute(self, task: str = "", label: str | None = None, **kwargs: Any) -> str:
        task = (task or "").strip()
        if not task:
            return "Error: task is required"

        depth = _depth.get()
        if depth >= MAX_DEPTH:
            return (
                f"Error: subagent depth limit reached "
                f"(depth={depth}, max={MAX_DEPTH}). Cannot spawn further."
            )

        if self._loop is None:
            return "Error: spawn tool is not wired (no AgentLoop)"

        loop = self._loop
        parent_id = _parent_session_id.get()
        if not parent_id:
            return "Error: no parent session bound for spawn"

        parent = loop.sessions.get(parent_id)
        if parent is None:
            return f"Error: unknown parent session {parent_id!r}"

        task_id = uuid.uuid4().hex[:10]
        child_id = f"{parent_id}/sub/{task_id}"
        title = (label or task).strip()[:60]
        child = loop.sessions.create(
            session_id=child_id,
            title=title,
            workspace=parent.workspace_path,
        )

        # Child tools: default set without spawn (no recursive tool registration).
        child_tools = register_default_tools()
        child_token = _depth.set(depth + 1)
        parent_token = _parent_session_id.set(child_id)
        try:
            result = await loop.runner.run(
                messages=[{"role": "user", "content": task}],
                tools=child_tools,
                model=loop.config.model,
                max_iterations=loop.config.max_iterations,
                temperature=loop.config.temperature,
                system=SUBAGENT_SYSTEM,
            )
        finally:
            _parent_session_id.reset(parent_token)
            _depth.reset(child_token)

        # Persist child transcript (skip leading system if present).
        msgs = list(result.messages)
        if msgs and msgs[0].get("role") == "system":
            msgs = msgs[1:]
        if not msgs:
            msgs = [
                {"role": "user", "content": task},
                {"role": "assistant", "content": result.content},
            ]
        loop.sessions.append_messages(child.id, msgs)

        label_bit = f" label={title!r}" if title else ""
        preview = result.content if len(result.content) <= 4000 else result.content[:4000] + "…"
        return (
            f"[subagent done] session={child.id}{label_bit} "
            f"stop={result.stop_reason}\n{preview}"
        )


def attach_spawn_tool(registry: Any, *, loop: AgentLoop) -> SpawnTool:
    """Register spawn on the parent registry and wire the loop."""
    existing = registry.get("spawn")
    if isinstance(existing, SpawnTool):
        existing.bind_loop(loop)
        return existing
    tool = SpawnTool()
    tool.bind_loop(loop)
    registry.register(tool)
    return tool
