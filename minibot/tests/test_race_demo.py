"""Destructive race demo: why session lock exists."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fake_provider import FakeProvider, text_response
from fastapi.testclient import TestClient

from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.registry import ToolRegistry
from minibot.config.app_config import AppConfig
from minibot.devtools.race_demo import run_session_race
from minibot.session.store import SessionStore


def _loop_and_store(tmp_path: Path) -> tuple[AgentLoop, SessionStore]:
    store = SessionStore(data_dir=tmp_path)
    loop = AgentLoop(
        sessions=store,
        tools=ToolRegistry(),
        runner=AgentRunner(FakeProvider(responses=[text_response("x")])),
        config=AppConfig(model="t"),
        system_prompt="sys",
    )
    return loop, store


def test_unsafe_race_loses_messages(tmp_path: Path) -> None:
    loop, store = _loop_and_store(tmp_path)

    async def _run() -> dict:
        return await run_session_race(
            store=store,
            loop=loop,
            mode="unsafe",
            concurrency=2,
            snapshot_delay_s=0.08,
            work_s=0.02,
        )

    result = asyncio.run(_run())
    assert result["verdict"] == "CORRUPTED"
    assert result["actual_user_turns"] < result["expected_user_turns"]
    assert any("lost_update" in p for p in result["problems"])


def test_safe_race_keeps_all_messages(tmp_path: Path) -> None:
    loop, store = _loop_and_store(tmp_path)

    async def _run() -> dict:
        return await run_session_race(
            store=store,
            loop=loop,
            mode="safe",
            concurrency=2,
            snapshot_delay_s=0.05,
            work_s=0.02,
        )

    result = asyncio.run(_run())
    assert result["verdict"] == "OK"
    assert result["actual_user_turns"] == 2
    assert result["actual_assistant_turns"] == 2


def test_race_api_and_page(client: TestClient, auth_headers: dict[str, str]) -> None:
    unsafe = client.post(
        "/api/dev/race",
        headers=auth_headers,
        json={"mode": "unsafe", "concurrency": 2},
    )
    assert unsafe.status_code == 200
    body = unsafe.json()
    assert body["mode"] == "unsafe"
    assert body["verdict"] == "CORRUPTED"

    safe = client.post(
        "/api/dev/race",
        headers=auth_headers,
        json={"mode": "safe", "concurrency": 2},
    )
    assert safe.status_code == 200
    assert safe.json()["verdict"] == "OK"

    page = client.get("/ui/race.html")
    assert page.status_code == 200
    assert "Session Lock" in page.text or "Race Demo" in page.text
    common = client.get("/ui/common.js")
    assert "race.html" in common.text
    assert "Race Demo" in common.text
