"""Phase 3b: memory + skills."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fake_provider import FakeProvider, text_response

from minibot.agent.context import build_system_prompt, inspect_context
from minibot.agent.loop import AgentLoop
from minibot.agent.memory import read_memory, write_memory
from minibot.agent.runner import AgentRunner
from minibot.agent.skills import SkillsRegistry
from minibot.agent.tools.builtin import SYSTEM_PROMPT, register_default_tools
from minibot.agent.tools.spawn import attach_spawn_tool
from minibot.config.app_config import AppConfig
from minibot.security.workspace_access import bind_workspace, reset_workspace
from minibot.session.store import SessionStore


def test_memory_read_write(tmp_path: Path) -> None:
    assert read_memory(tmp_path).exists is False
    write_memory("User likes cats.", tmp_path, mode="replace")
    snap = read_memory(tmp_path)
    assert snap.exists
    assert "cats" in snap.text
    write_memory("Also dogs.", tmp_path, mode="append")
    assert "cats" in read_memory(tmp_path).text
    assert "dogs" in read_memory(tmp_path).text


def test_memory_in_system_prompt(tmp_path: Path) -> None:
    write_memory("Remember: BANANA_PREF", tmp_path)
    built = build_system_prompt(workspace=tmp_path, identity=SYSTEM_PROMPT)
    assert built.flags["memory"] is True
    assert "BANANA_PREF" in built.text
    assert "# Memory" in built.text


def test_builtin_skills_loaded() -> None:
    reg = SkillsRegistry(workspace=None)
    names = {s.name for s in reg.list_skills()}
    assert "memory" in names
    assert "github" in names
    assert "summarize" in names
    assert "skill-creator" in names
    assert "weather" in names
    assert "tmux" in names
    assert "clawhub" in names
    always = {s.name for s in reg.always_skills()}
    assert "memory" in always


def test_workspace_skill_overrides_builtin(tmp_path: Path) -> None:
    skill_dir = tmp_path / "skills" / "github"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: github\ndescription: Workspace override github.\n---\n\n# WS\n",
        encoding="utf-8",
    )
    reg = SkillsRegistry(tmp_path)
    gh = next(s for s in reg.list_skills() if s.name == "github")
    assert gh.source == "workspace"
    assert "override" in gh.description


def test_skills_injected_into_system(tmp_path: Path) -> None:
    built = build_system_prompt(workspace=tmp_path, identity=SYSTEM_PROMPT)
    assert built.skills_count >= 3
    assert "# Active Skills" in built.text
    assert "# Skills" in built.text
    assert "github" in built.text


def test_write_memory_tool_roundtrip(tmp_path: Path) -> None:
    tools = register_default_tools()
    token = bind_workspace(str(tmp_path))
    try:

        async def _run() -> None:
            msg = await tools.execute(
                "write_memory",
                {"content": "prefers dark mode", "mode": "replace"},
            )
            assert "Wrote" in msg
            text = await tools.execute("read_memory", {})
            assert "dark mode" in text

        asyncio.run(_run())
    finally:
        reset_workspace(token)
    assert "dark mode" in read_memory(tmp_path).text


def test_inspect_includes_memory_and_skills(tmp_path: Path) -> None:
    write_memory("note", tmp_path)
    info = inspect_context(workspace=tmp_path, identity=SYSTEM_PROMPT)
    assert info["flags"]["memory"] is True
    assert info["memory"]["exists"] is True
    assert info["skills_count"] >= 3


def test_handle_turn_sees_memory(tmp_path: Path) -> None:
    write_memory("Always mention KIWI.\n", tmp_path)
    provider = FakeProvider(responses=[text_response("hi")])

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
        await loop.handle_turn(session.id, "hello")
        sys_msg = provider.calls[0]["messages"][0]
        assert sys_msg["role"] == "system"
        assert "KIWI" in sys_msg["content"]

    asyncio.run(_run())
