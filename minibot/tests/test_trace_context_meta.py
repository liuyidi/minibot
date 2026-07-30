"""Trace includes memory/skills context injection meta."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fake_provider import FakeProvider, text_response

from minibot.agent.context import build_system_prompt
from minibot.agent.loop import AgentLoop
from minibot.agent.memory import write_memory
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.builtin import SYSTEM_PROMPT, register_default_tools
from minibot.agent.tools.spawn import attach_spawn_tool
from minibot.config.app_config import AppConfig
from minibot.session.store import SessionStore


def test_to_trace_meta_shape(tmp_path: Path) -> None:
    write_memory("- User is Alice\n", tmp_path)
    built = build_system_prompt(workspace=tmp_path, identity=SYSTEM_PROMPT)
    meta = built.to_trace_meta(tmp_path)
    assert meta["memory"]["injected"] is True
    assert "Alice" in meta["memory"]["preview"]
    assert meta["skills"]["count"] >= 3
    assert "memory" in meta["skills"]["always"]
    assert any(i["name"] == "github" for i in meta["skills"]["items"])


def test_loop_trace_embeds_context_meta(tmp_path: Path) -> None:
    write_memory("- User is Bob\n", tmp_path)
    provider = FakeProvider(responses=[text_response("hi Bob")])

    async def _run() -> None:
        sessions = SessionStore(data_dir=tmp_path / "data")
        tools = register_default_tools()
        loop = AgentLoop(
            sessions=sessions,
            tools=tools,
            runner=AgentRunner(provider),
            config=AppConfig(model="fake", max_iterations=2, temperature=0.0, compact_threshold=1000),
            system_prompt=SYSTEM_PROMPT,
        )
        attach_spawn_tool(tools, loop=loop)
        session = sessions.create(workspace=tmp_path)
        result = await loop.handle_turn(session.id, "who am i")
        prepare = next(s for s in result.trace if s["type"] == "prepare")
        req = next(s for s in result.trace if s["type"] == "llm_request")
        assert "context" in prepare
        assert prepare["context"]["memory"]["injected"] is True
        assert req["context"]["skills"]["count"] >= 3
        assert "Bob" in prepare["context"]["memory"]["preview"]

    asyncio.run(_run())
