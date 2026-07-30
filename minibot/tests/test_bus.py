"""Phase 0.4: MessageBus worker + WS via inbound/outbound."""

from __future__ import annotations

import inspect
import time
from pathlib import Path

from fastapi.testclient import TestClient

from minibot.api import ws as ws_mod
from minibot.bus import worker as worker_mod


def _wait_runtime(client: TestClient, headers: dict[str, str], pred, timeout_s: float = 2.0):
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        last = client.get("/api/dev/runtime", headers=headers).json()
        if pred(last):
            return last
        time.sleep(0.05)
    return last


def test_runtime_includes_bus_snapshot(client: TestClient, auth_headers: dict[str, str]) -> None:
    res = client.get("/api/dev/runtime", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "bus" in body
    assert body["bus"]["worker"]["running"] is True
    assert body["bus"]["inbound_depth"] == 0
    assert body["bus"]["outbound_depth"] == 0


def test_ws_message_goes_through_bus(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post("/api/sessions", headers=auth_headers, json={})
    session_id = created.json()["id"]
    token = auth_headers["Authorization"].removeprefix("Bearer ").strip()

    before = client.get("/api/dev/runtime", headers=auth_headers).json()
    ws0 = before["entry_counts"].get("ws", 0)
    pub0 = before["bus"]["stats"]["inbound_published"]

    with client.websocket_connect(f"/ws?token={token}") as ws:
        # drain ready
        ready = ws.receive_json()
        assert ready.get("event") == "ready"
        ws.send_json({"type": "message", "chat_id": session_id, "content": "hi via bus"})
        for _ in range(30):
            evt = ws.receive_json()
            if evt.get("event") == "goal_status" and evt.get("status") == "idle":
                break

    after = _wait_runtime(
        client,
        auth_headers,
        lambda b: b["entry_counts"].get("ws", 0) >= ws0 + 1
        and b["bus"]["stats"]["inbound_published"] >= pub0 + 1,
    )
    assert after is not None
    assert after["entry_counts"]["ws"] == ws0 + 1
    assert after["bus"]["stats"]["inbound_published"] >= pub0 + 1
    assert after["bus"]["stats"]["outbound_published"] >= 1
    assert after["bus"]["inbound_depth"] == 0
    kinds = [e.get("kind") for e in after["bus"]["timeline"]]
    assert any(k == "publish" for k in kinds)
    assert any(str(k).startswith("publish:") for k in kinds)


def test_bus_pause_piles_up_inbound(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    pause = client.post("/api/dev/bus/pause", headers=auth_headers)
    assert pause.status_code == 200
    assert pause.json()["paused"] is True

    inj = client.post("/api/dev/bus/inject", headers=auth_headers, json={"content": "stuck"})
    assert inj.status_code == 200
    depth = inj.json()["bus"]["inbound_depth"]
    assert depth >= 1

    # still piled while paused
    mid = client.get("/api/dev/runtime", headers=auth_headers).json()
    assert mid["bus"]["inbound_depth"] >= 1
    assert mid["bus"]["worker"]["paused"] is True

    resume = client.post("/api/dev/bus/resume", headers=auth_headers)
    assert resume.status_code == 200

    drained = _wait_runtime(
        client,
        auth_headers,
        lambda b: b["bus"]["inbound_depth"] == 0 and b["bus"]["worker"]["paused"] is False,
    )
    assert drained is not None
    assert drained["bus"]["inbound_depth"] == 0


def test_ws_module_publishes_inbound_not_handle_turn() -> None:
    ws_src = Path(inspect.getfile(ws_mod)).read_text(encoding="utf-8")
    worker_src = Path(inspect.getfile(worker_mod)).read_text(encoding="utf-8")
    assert "publish_inbound" in ws_src
    assert "state.loop.handle_turn" not in ws_src
    assert "loop.handle_turn" in worker_src


def test_runtime_page_shows_bus(client: TestClient) -> None:
    page = client.get("/ui/runtime.html")
    assert page.status_code == 200
    assert "MessageBus" in page.text
    assert "Phase 0." in page.text
    assert "暂停消费者" in page.text
