"""Phase 0.3: REST / WS / CLI / Dev enter only via AgentLoop."""

from __future__ import annotations

import inspect
from pathlib import Path

from fastapi.testclient import TestClient

from minibot.api.routes import sessions as sessions_mod
from minibot.api import ws as ws_mod
from minibot import cli_chat


def test_rest_turn_increments_entry_counts_rest(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post("/api/sessions", headers=auth_headers, json={})
    assert created.status_code == 200
    session_id = created.json()["id"]

    before = client.get("/api/dev/runtime", headers=auth_headers).json()
    assert before["entry_path"] == "loop"
    rest0 = before["entry_counts"].get("rest", 0)

    turn = client.post(
        f"/api/sessions/{session_id}/turns",
        headers=auth_headers,
        json={"content": "hello via rest"},
    )
    assert turn.status_code == 200
    assert turn.json()["content"] == "ok from fake provider"

    after = client.get("/api/dev/runtime", headers=auth_headers).json()
    assert after["entry_path"] == "loop"
    assert after["entry_counts"]["rest"] == rest0 + 1
    assert after["last_turns"][0]["entry"] == "rest"
    assert after["last_turns"][0]["session_id"] == session_id


def test_demo_turn_increments_entry_counts_dev(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    before = client.get("/api/dev/runtime", headers=auth_headers).json()
    dev0 = before["entry_counts"].get("dev", 0)

    res = client.post("/api/dev/runtime/demo-turn", headers=auth_headers, json={})
    assert res.status_code == 200

    after = client.get("/api/dev/runtime", headers=auth_headers).json()
    assert after["entry_counts"]["dev"] == dev0 + 1
    assert after["last_turns"][0]["entry"] == "dev"


def test_ws_message_increments_entry_counts_ws(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post("/api/sessions", headers=auth_headers, json={})
    session_id = created.json()["id"]
    token = auth_headers["Authorization"].removeprefix("Bearer ").strip()

    before = client.get("/api/dev/runtime", headers=auth_headers).json()
    ws0 = before["entry_counts"].get("ws", 0)

    with client.websocket_connect(f"/ws?token={token}") as ws:
        ws.send_json({"type": "message", "chat_id": session_id, "content": "hi via ws"})
        # drain until goal idle or a few events
        for _ in range(20):
            evt = ws.receive_json()
            if evt.get("event") == "goal_status" and evt.get("status") == "idle":
                break

    after = client.get("/api/dev/runtime", headers=auth_headers).json()
    assert after["entry_counts"]["ws"] == ws0 + 1
    assert any(t.get("entry") == "ws" for t in after["last_turns"])


def test_api_modules_do_not_call_runner_run_directly() -> None:
    """Static guard: hot-path modules must go through loop.handle_turn."""
    sessions_src = Path(inspect.getfile(sessions_mod)).read_text(encoding="utf-8")
    ws_src = Path(inspect.getfile(ws_mod)).read_text(encoding="utf-8")
    cli_src = Path(inspect.getfile(cli_chat)).read_text(encoding="utf-8")

    assert "runner.run" not in sessions_src
    assert "loop.handle_turn" in sessions_src
    assert "entry=\"rest\"" in sessions_src or "entry='rest'" in sessions_src

    assert "runner.run" not in ws_src
    assert "_run_agent_turn" not in ws_src
    assert "publish_inbound" in ws_src
    assert "state.loop.handle_turn" not in ws_src

    assert "runner.run" not in cli_src
    assert "loop.handle_turn" in cli_src
    assert "entry=\"cli\"" in cli_src or "entry='cli'" in cli_src


def test_runtime_page_shows_entry_counts(client: TestClient) -> None:
    page = client.get("/ui/runtime.html")
    assert page.status_code == 200
    assert "entry_path" in page.text
    assert "Entry counts" in page.text
    assert "MessageBus" in page.text
