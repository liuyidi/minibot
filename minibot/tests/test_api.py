"""Basic API tests for minibot."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_bootstrap_and_session_flow(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post("/api/sessions", headers=auth_headers, json={})
    assert created.status_code == 200
    session_id = created.json()["id"]

    listed = client.get("/api/sessions", headers=auth_headers)
    assert listed.status_code == 200
    assert any(s["id"] == session_id for s in listed.json()["sessions"])

    turn = client.post(
        f"/api/sessions/{session_id}/turns",
        headers=auth_headers,
        json={"content": "hello"},
    )
    assert turn.status_code == 200
    body = turn.json()
    assert body["content"] == "ok from fake provider"
    assert isinstance(body.get("trace"), list)
    assert body["trace"][-1]["type"] == "done"


def test_devui_served(client: TestClient) -> None:
    root = client.get("/", follow_redirects=False)
    if root.status_code in {307, 302}:
        assert root.headers["location"].endswith("/ui/")
    else:
        # WebUI SPA mounted when ``webui/dist`` is present in the checkout.
        assert root.status_code == 200

    page = client.get("/ui/")
    assert page.status_code == 200
    assert "minibot Dev UI" in page.text
    assert "实验室" in page.text
    assert "Sessions" in page.text
    assert "btnScoreUp" in page.text
    assert "lfBadge" in page.text

    trace = client.get("/ui/trace.html")
    assert trace.status_code == 200
    assert "Agent Trace" in trace.text

    files_page = client.get("/ui/session-files.html")
    assert files_page.status_code == 200
    assert "Session Files" in files_page.text

    common = client.get("/ui/common.js")
    assert common.status_code == 200
    assert "publishTrace" in common.text
    assert "DEV_NAV" in common.text
    assert "race.html" in common.text
    assert "Session Files" in common.text
    assert "tools.html" in common.text

    tools_page = client.get("/ui/tools.html")
    assert tools_page.status_code == 200
    assert "Registered tools" in tools_page.text


def test_score_endpoint_unavailable_when_langfuse_off(
    client: TestClient, auth_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from minibot.observability import langfuse as lf

    monkeypatch.setattr(lf, "is_enabled", lambda: False)
    created = client.post("/api/sessions", headers=auth_headers, json={})
    assert created.status_code == 200
    session_id = created.json()["id"]

    res = client.post(
        f"/api/sessions/{session_id}/score",
        headers=auth_headers,
        json={"value": 1, "data_type": "BOOLEAN"},
    )
    assert res.status_code == 503
    assert "langfuse" in res.json()["detail"].lower()


def test_settings_includes_observability(client: TestClient, auth_headers: dict[str, str]) -> None:
    res = client.get("/api/settings", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "observability" in body
    assert "langfuse_enabled" in body["observability"]
    assert "mobile_entry" in body
    assert body["mobile_entry"]["enabled"] is True


def test_status_page_served(client: TestClient) -> None:
    res = client.get("/status")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store, max-age=0"
    assert "bot.liuyidi.me" in res.text
    assert "status-bootstrap" in res.text
    assert "订阅更新" in res.text
    assert "/status.json" in res.text


def test_status_json_payload(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from minibot.observability import langfuse as lf

    monkeypatch.setattr(lf, "is_enabled", lambda: False)

    res = client.get("/status.json")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store, max-age=0"

    body = res.json()
    assert body["runtime"]["name"] == "minibot"
    assert body["overall"]["status"] == "operational"
    assert body["links"]["status_json"] == "/status.json"
    assert isinstance(body["components"], list)
    assert any(item["key"] == "core_runtime" for item in body["components"])
    assert any(item["key"] == "observability" for item in body["components"])
    assert body["generated_at"]


def test_dev_session_files_api(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post("/api/sessions", headers=auth_headers, json={})
    assert created.status_code == 200
    session_id = created.json()["id"]

    res = client.get("/api/dev/session-files", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["sessions_dir"].endswith("sessions")
    names = [f["name"] if isinstance(f, dict) else f for f in body["files"]]
    assert f"{session_id}.jsonl" in names
    entry = next(f for f in body["files"] if isinstance(f, dict) and f["name"] == f"{session_id}.jsonl")
    assert entry.get("created_at")
    assert entry.get("updated_at")

    deleted = client.post(
        "/api/dev/session-files/delete",
        headers=auth_headers,
        json={"files": [f"{session_id}.jsonl"]},
    )
    assert deleted.status_code == 200
    assert f"{session_id}.jsonl" in deleted.json()["deleted"]
    left = [f["name"] if isinstance(f, dict) else f for f in deleted.json()["files"]]
    assert f"{session_id}.jsonl" not in left
