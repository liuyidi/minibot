"""Phase 0.2: AgentLoop session lock + runtime snapshot."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fake_provider import FakeProvider, text_response
from fastapi.testclient import TestClient

from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.echo import EchoTool
from minibot.agent.tools.registry import ToolRegistry
from minibot.config.app_config import AppConfig
from minibot.session.store import SessionStore


class GatedProvider(FakeProvider):
    """Records enter/leave around a short sleep for lock serialization tests."""

    def __init__(self, *args: Any, delay_s: float = 0.05, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.delay_s = delay_s
        self.timeline: list[str] = []

    async def chat_stream(self, messages: list[dict[str, Any]], **kwargs: Any) -> Any:
        self.timeline.append("enter")
        await asyncio.sleep(self.delay_s)
        try:
            async for ev in super().chat_stream(messages, **kwargs):
                yield ev
        finally:
            self.timeline.append("leave")


def _make_loop(tmp_path: Path, provider: FakeProvider) -> tuple[AgentLoop, SessionStore]:
    store = SessionStore(data_dir=tmp_path)
    tools = ToolRegistry()
    tools.register(EchoTool())
    config = AppConfig(model="test-model", max_iterations=4, temperature=0.0)
    loop = AgentLoop(
        sessions=store,
        tools=tools,
        runner=AgentRunner(provider),
        config=config,
        system_prompt="sys",
    )
    return loop, store


def test_same_session_turns_are_serialized(tmp_path: Path) -> None:
    provider = GatedProvider(
        responses=[text_response("a"), text_response("b")],
        delay_s=0.05,
    )
    loop, store = _make_loop(tmp_path, provider)
    session = store.create()

    async def _run() -> None:
        await asyncio.gather(
            loop.handle_turn(session.id, "one"),
            loop.handle_turn(session.id, "two"),
        )

    asyncio.run(_run())
    assert provider.timeline == ["enter", "leave", "enter", "leave"]
    reloaded = store.get(session.id)
    assert reloaded is not None
    assert len([m for m in reloaded.messages if m.get("role") == "user"]) == 2


def test_different_sessions_can_run_concurrently(tmp_path: Path) -> None:
    provider = GatedProvider(
        responses=[text_response("a"), text_response("b")],
        delay_s=0.08,
    )
    loop, store = _make_loop(tmp_path, provider)
    s1 = store.create()
    s2 = store.create()

    async def _run() -> None:
        await asyncio.gather(
            loop.handle_turn(s1.id, "one"),
            loop.handle_turn(s2.id, "two"),
        )

    asyncio.run(_run())
    assert provider.timeline[0] == "enter"
    assert provider.timeline[1] == "enter"
    assert provider.timeline.count("enter") == 2
    assert provider.timeline.count("leave") == 2


def test_runtime_snapshot_reports_lock_and_last_turn(tmp_path: Path) -> None:
    provider = FakeProvider(responses=[text_response("ok")])
    loop, store = _make_loop(tmp_path, provider)
    session = store.create()

    async def _run() -> None:
        await loop.handle_turn(session.id, "hello")

    asyncio.run(_run())
    snap = loop.runtime_snapshot()

    assert "sessions" in snap
    row = next(s for s in snap["sessions"] if s["session_id"] == session.id)
    assert row["lock"] == "idle"
    assert row["waiters"] == 0
    assert isinstance(row["last_duration_ms"], (int, float))
    assert row["last_duration_ms"] >= 0
    assert row["last_finished_at"]
    assert snap["last_turns"]
    assert snap["last_turns"][0]["session_id"] == session.id
    assert snap["entry_path"] == "loop"
    assert snap["entry_counts"]["unknown"] >= 1


def test_handle_turn_unknown_session_raises(tmp_path: Path) -> None:
    provider = FakeProvider(responses=[text_response("ok")])
    loop, _store = _make_loop(tmp_path, provider)

    async def _run() -> None:
        await loop.handle_turn("missing-id", "hi")

    try:
        asyncio.run(_run())
        raise AssertionError("expected KeyError")
    except KeyError:
        pass


def test_dev_runtime_api(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post("/api/sessions", headers=auth_headers, json={})
    session_id = created.json()["id"]

    state = client.app.state.app_state

    async def _via_loop() -> None:
        await state.loop.handle_turn(session_id, "via-loop")

    asyncio.run(_via_loop())

    res = client.get("/api/dev/runtime", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["entry_path"] == "loop"
    assert "entry_counts" in body
    assert "sessions" in body
    assert any(s["session_id"] == session_id for s in body["sessions"])
    assert "last_turns" in body


def test_runtime_page_served(client: TestClient) -> None:
    page = client.get("/ui/runtime.html")
    assert page.status_code == 200
    assert "Runtime" in page.text
    assert "Phase 0." in page.text
    common = client.get("/ui/common.js")
    assert "runtime.html" in common.text
    assert "Runtime" in common.text
