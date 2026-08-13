"""Manual /compact slash command + force compaction."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fake_provider import FakeProvider, text_response

from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.builtin import SYSTEM_PROMPT, register_default_tools
from minibot.agent.tools.spawn import attach_spawn_tool
from minibot.config.app_config import AppConfig
from minibot.session.store import SessionStore


def _make_loop(
    tmp_path: Path,
    provider: FakeProvider,
    *,
    compact_threshold: int = 40,
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


def test_force_compact_ignores_threshold(tmp_path: Path) -> None:
    provider = FakeProvider(responses=[text_response("SUMMARY: cats and dogs")])

    async def _run() -> None:
        loop, sessions = _make_loop(
            tmp_path,
            provider,
            compact_threshold=1000,
            compact_keep_recent=2,
        )
        session = sessions.create(workspace=tmp_path)
        sessions.append_messages(
            session.id,
            [
                {"role": "user", "content": "a"},
                {"role": "assistant", "content": "1"},
                {"role": "user", "content": "b"},
                {"role": "assistant", "content": "2"},
                {"role": "user", "content": "c"},
                {"role": "assistant", "content": "3"},
            ],
        )
        event = await loop.compact_if_needed(session.id, force=True)
        assert event is not None
        assert event["ok"] is True
        fresh = sessions.get(session.id)
        assert fresh is not None
        assert len(fresh.messages) == 2
        assert "cats" in (fresh.summary or "").lower() or "SUMMARY" in (fresh.summary or "")
        assert provider.calls  # summarizer was invoked

    asyncio.run(_run())


def test_force_compact_skips_when_too_short(tmp_path: Path) -> None:
    provider = FakeProvider(responses=[])

    async def _run() -> None:
        loop, sessions = _make_loop(tmp_path, provider, compact_keep_recent=4)
        session = sessions.create(workspace=tmp_path)
        sessions.append_messages(
            session.id,
            [
                {"role": "user", "content": "a"},
                {"role": "assistant", "content": "1"},
            ],
        )
        event = await loop.compact_if_needed(session.id, force=True)
        assert event is not None
        assert event.get("skipped") is True
        assert not provider.calls
        fresh = sessions.get(session.id)
        assert fresh is not None
        assert len(fresh.messages) == 2

    asyncio.run(_run())


def test_force_compact_below_configured_keep_uses_half_window(tmp_path: Path) -> None:
    """Manual /compact should still archive when count is under compact_keep_recent."""
    provider = FakeProvider(responses=[text_response("SUMMARY: older turns")])

    async def _run() -> None:
        loop, sessions = _make_loop(
            tmp_path,
            provider,
            compact_threshold=1000,
            compact_keep_recent=16,
        )
        session = sessions.create(workspace=tmp_path)
        messages: list[dict[str, str]] = []
        for i in range(7):
            messages.append({"role": "user", "content": f"u{i}"})
            messages.append({"role": "assistant", "content": f"a{i}"})
        sessions.append_messages(session.id, messages)  # 14 messages
        event = await loop.compact_if_needed(session.id, force=True)
        assert event is not None
        assert event.get("skipped") is not True
        assert event["ok"] is True
        assert event["before"] == 14
        assert event["after"] == 7
        fresh = sessions.get(session.id)
        assert fresh is not None
        assert len(fresh.messages) == 7
        assert "SUMMARY" in (fresh.summary or "")
        assert provider.calls

    asyncio.run(_run())


def test_compact_slash_command_force_and_does_not_persist_command(tmp_path: Path) -> None:
    provider = FakeProvider(responses=[text_response("SUMMARY: archived older turns")])

    async def _run() -> None:
        loop, sessions = _make_loop(
            tmp_path,
            provider,
            compact_threshold=1000,
            compact_keep_recent=2,
        )
        session = sessions.create(workspace=tmp_path)
        sessions.append_messages(
            session.id,
            [
                {"role": "user", "content": "a"},
                {"role": "assistant", "content": "1"},
                {"role": "user", "content": "b"},
                {"role": "assistant", "content": "2"},
                {"role": "user", "content": "c"},
                {"role": "assistant", "content": "3"},
            ],
        )
        before = len(sessions.get(session.id).messages)  # type: ignore[union-attr]
        result = await loop.handle_turn(session.id, "  /compact  ")
        fresh = sessions.get(session.id)
        assert fresh is not None
        # Force keep = min(2, 6//2) = 2 recent + 1 assistant compact reply
        assert len(fresh.messages) == 3
        assert before == 6
        assert not any(
            m.get("role") == "user" and "/compact" in str(m.get("content") or "")
            for m in fresh.messages
        )
        assert fresh.messages[-1].get("role") == "assistant"
        assert "SUMMARY" in result.content or "compact" in result.content.lower()
        assert result.stop_reason == "completed"
        assert result.streamed_answer is False

    asyncio.run(_run())
