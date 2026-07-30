"""Phase 3a: context assembly + compaction."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fake_provider import FakeProvider, text_response

from minibot.agent.context import build_system_prompt, inspect_context
from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.builtin import SYSTEM_PROMPT, register_default_tools
from minibot.agent.tools.spawn import attach_spawn_tool
from minibot.config.app_config import AppConfig
from minibot.session.store import SessionStore


def test_soul_md_in_system_prompt(tmp_path: Path) -> None:
    (tmp_path / "SOUL.md").write_text("Be terse and prefer diffs.\n", encoding="utf-8")
    built = build_system_prompt(workspace=tmp_path, identity=SYSTEM_PROMPT)
    assert "Be terse and prefer diffs" in built.text
    assert built.flags["soul"] is True
    assert built.flags["user"] is False


def test_inspect_context_marks_missing_bootstrap(tmp_path: Path) -> None:
    info = inspect_context(workspace=tmp_path, identity=SYSTEM_PROMPT)
    assert info["flags"]["soul"] is False
    assert "SOUL.md" in info["missing_bootstrap"]


def _make_loop(
    tmp_path: Path,
    provider: FakeProvider,
    *,
    compact_threshold: int = 8,
    compact_keep_recent: int = 4,
) -> tuple[AgentLoop, SessionStore]:
    sessions = SessionStore(data_dir=tmp_path / "data")
    tools = register_default_tools()
    runner = AgentRunner(provider)
    config = AppConfig(
        model="fake-model",
        max_iterations=4,
        temperature=0.0,
        compact_threshold=compact_threshold,
        compact_keep_recent=compact_keep_recent,
    )
    loop = AgentLoop(
        sessions=sessions,
        tools=tools,
        runner=runner,
        config=config,
        system_prompt=SYSTEM_PROMPT,
    )
    attach_spawn_tool(tools, loop=loop)
    return loop, sessions


def test_compaction_summarizes_and_keeps_recent(tmp_path: Path) -> None:
    # 3 turns → 6 msgs → compact (SUMMARY); 2 more turns → compact again optional
    provider = FakeProvider(
        responses=[
            text_response("ok-0"),
            text_response("ok-1"),
            text_response("ok-2"),
            text_response("SUMMARY: user talked about cats and dogs"),
            text_response("ok-4"),
            text_response("ok-5"),
            text_response("SUMMARY2: later"),
        ]
    )

    async def _run() -> None:
        loop, sessions = _make_loop(
            tmp_path,
            provider,
            compact_threshold=6,
            compact_keep_recent=2,
        )
        session = sessions.create(workspace=tmp_path)
        for i in range(5):
            await loop.handle_turn(session.id, f"msg-{i}")
        fresh = sessions.get(session.id)
        assert fresh is not None
        assert len(fresh.messages) <= 4
        assert "cats" in (fresh.summary or "").lower() or "SUMMARY" in (fresh.summary or "")
        assert loop.compaction_log
        assert any(e.get("ok") for e in loop.compaction_log)

    asyncio.run(_run())


def test_handle_turn_uses_workspace_soul(tmp_path: Path) -> None:
    (tmp_path / "SOUL.md").write_text("Always mention BANANA.\n", encoding="utf-8")
    provider = FakeProvider(responses=[text_response("hi")])

    async def _run() -> None:
        loop, sessions = _make_loop(tmp_path, provider, compact_threshold=1000)
        session = sessions.create(workspace=tmp_path)
        await loop.handle_turn(session.id, "hello")
        # First provider call messages should include system with BANANA
        assert provider.calls
        sys_msg = provider.calls[0]["messages"][0]
        assert sys_msg["role"] == "system"
        assert "BANANA" in sys_msg["content"]

    asyncio.run(_run())
