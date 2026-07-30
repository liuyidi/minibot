"""Phase 1.5A: sync spawn subagent."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fake_provider import FakeProvider, text_response, tool_response

from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.builtin import SYSTEM_PROMPT, register_default_tools
from minibot.agent.tools.spawn import SpawnTool, attach_spawn_tool
from minibot.config.app_config import AppConfig
from minibot.session.store import SessionStore


def _make_loop(tmp_path: Path, provider: FakeProvider) -> tuple[AgentLoop, SessionStore]:
    sessions = SessionStore(data_dir=tmp_path / "data")
    tools = register_default_tools()
    runner = AgentRunner(provider)
    config = AppConfig(model="fake-model", max_iterations=8, temperature=0.0)
    loop = AgentLoop(
        sessions=sessions,
        tools=tools,
        runner=runner,
        config=config,
        system_prompt=SYSTEM_PROMPT,
    )
    attach_spawn_tool(tools, loop=loop)
    return loop, sessions


def test_spawn_sync_returns_child_result(tmp_path: Path) -> None:
    """Parent calls spawn → child finishes → parent sees result in tool output."""
    provider = FakeProvider(
        responses=[
            tool_response("spawn", {"task": "summarize notes", "label": "notes"}),
            text_response("child done: notes ok"),
            text_response("Parent summary: notes ok"),
        ]
    )

    async def _run() -> None:
        loop, sessions = _make_loop(tmp_path, provider)
        parent = sessions.create(workspace=tmp_path)
        result = await loop.handle_turn(parent.id, "please spawn a subagent")
        assert "notes ok" in result.content or "Parent summary" in result.content
        # tool result should mention child session
        child_ids = [s.id for s in sessions.list() if "/sub/" in s.id]
        assert len(child_ids) == 1
        child = sessions.get(child_ids[0])
        assert child is not None
        assert any("child done" in str(m.get("content", "")) for m in child.messages)

    asyncio.run(_run())


def test_spawn_depth_limit(tmp_path: Path) -> None:
    """At depth>=2, spawn returns an error string (no third nesting)."""
    tool = SpawnTool()
    # Simulate already at depth 2 without full loop wiring.
    from minibot.agent.tools import spawn as spawn_mod

    token = spawn_mod._depth.set(2)
    try:

        async def _run() -> str:
            return await tool.execute(task="nope")

        out = asyncio.run(_run())
    finally:
        spawn_mod._depth.reset(token)

    assert "Error" in out or "depth" in out.lower()
    assert "2" in out


def test_attach_registers_spawn(tmp_path: Path) -> None:
    tools = register_default_tools()
    assert tools.get("spawn") is None
    loop, _ = _make_loop(tmp_path, FakeProvider(responses=[text_response("x")]))
    assert loop.tools.get("spawn") is not None
