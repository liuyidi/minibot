"""Phase 0.5: Session workspace_path + API / WS scope."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from minibot.session.store import SessionStore
from minibot.workspace import WorkspaceError, default_workspace, normalize_workspace


def test_normalize_rejects_missing(tmp_path: Path) -> None:
    missing = tmp_path / "nope"
    try:
        normalize_workspace(missing, must_exist=True)
        raise AssertionError("expected WorkspaceError")
    except WorkspaceError as exc:
        assert "does not exist" in str(exc)


def test_session_persists_workspace_path(tmp_path: Path) -> None:
    store = SessionStore(data_dir=tmp_path)
    ws = tmp_path / "proj"
    ws.mkdir()
    session = store.create(workspace=ws)
    assert session.workspace_path == str(ws.resolve())

    meta = json.loads((tmp_path / "sessions" / f"{session.id}.jsonl").read_text().splitlines()[0])
    assert meta["workspace_path"] == session.workspace_path

    reloaded = SessionStore(data_dir=tmp_path).get(session.id)
    assert reloaded is not None
    assert reloaded.workspace_path == session.workspace_path


def test_legacy_jsonl_without_workspace_defaults_home_workspace(tmp_path: Path) -> None:
    store = SessionStore(data_dir=tmp_path)
    session = store.create()
    path = tmp_path / "sessions" / f"{session.id}.jsonl"
    # Rewrite metadata without workspace_path (legacy).
    lines = path.read_text(encoding="utf-8").splitlines()
    meta = json.loads(lines[0])
    meta.pop("workspace_path", None)
    path.write_text(json.dumps(meta) + "\n" + "\n".join(lines[1:]), encoding="utf-8")

    found = SessionStore(data_dir=tmp_path).get(session.id)
    assert found is not None
    assert found.workspace_path == str(default_workspace())


def test_default_workspace_is_under_data_dir(tmp_path: Path, monkeypatch) -> None:
    from minibot.config.settings import get_settings

    monkeypatch.setenv("MINIBOT_SERVER_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    try:
        ws = default_workspace()
        assert ws == (tmp_path / "workspace").resolve()
        assert ws.is_dir()
    finally:
        get_settings.cache_clear()


def test_api_workspaces_and_set(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path, monkeypatch
) -> None:
    # Ensure create uses a known cwd under tmp when possible — default is process cwd.
    listed = client.get("/api/workspaces", headers=auth_headers)
    assert listed.status_code == 200
    body = listed.json()
    assert body["default_workspace"]
    assert any(w.get("is_default") for w in body["workspaces"])

    created = client.post("/api/sessions", headers=auth_headers, json={})
    assert created.status_code == 200
    sid = created.json()["id"]
    assert created.json()["workspace_path"]

    alt = tmp_path / "alt-ws"
    alt.mkdir()
    ok = client.post(
        f"/api/sessions/{sid}/workspace",
        headers=auth_headers,
        json={"workspace_path": str(alt)},
    )
    assert ok.status_code == 200
    assert ok.json()["workspace_path"] == str(alt.resolve())

    bad = client.post(
        f"/api/sessions/{sid}/workspace",
        headers=auth_headers,
        json={"workspace_path": str(tmp_path / "missing-dir")},
    )
    assert bad.status_code == 400

    # Session still on previous workspace
    sessions = client.get("/api/sessions", headers=auth_headers).json()["sessions"]
    row = next(s for s in sessions if s["id"] == sid)
    assert row["workspace_path"] == str(alt.resolve())


def test_create_session_with_workspace(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    ws = tmp_path / "created-ws"
    ws.mkdir()
    created = client.post(
        "/api/sessions",
        headers=auth_headers,
        json={"title": "w", "workspace_path": str(ws)},
    )
    assert created.status_code == 200
    assert created.json()["workspace_path"] == str(ws.resolve())


def test_turn_records_workspace_after_switch(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    ws = tmp_path / "turn-ws"
    ws.mkdir()
    created = client.post("/api/sessions", headers=auth_headers, json={})
    sid = created.json()["id"]
    client.post(
        f"/api/sessions/{sid}/workspace",
        headers=auth_headers,
        json={"workspace_path": str(ws)},
    )
    turn = client.post(
        f"/api/sessions/{sid}/turns",
        headers=auth_headers,
        json={"content": "hello"},
    )
    assert turn.status_code == 200
    runtime = client.get("/api/dev/runtime", headers=auth_headers).json()
    assert runtime["last_turns"][0]["workspace_path"] == str(ws.resolve())
    assert runtime["last_turns"][0]["session_id"] == sid


def test_ws_set_workspace_scope(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    ws = tmp_path / "ws-scope"
    ws.mkdir()
    created = client.post("/api/sessions", headers=auth_headers, json={})
    sid = created.json()["id"]
    token = auth_headers["Authorization"].removeprefix("Bearer ").strip()

    with client.websocket_connect(f"/ws?token={token}") as sock:
        ready = sock.receive_json()
        assert ready.get("event") == "ready"
        sock.send_json(
            {
                "type": "set_workspace_scope",
                "chat_id": sid,
                "workspace_scope": {"project_path": str(ws), "access_mode": "restricted"},
            }
        )
        evt = sock.receive_json()
        assert evt.get("event") == "workspace_updated"
        assert evt.get("workspace_path") == str(ws.resolve())

        sock.send_json(
            {
                "type": "set_workspace_scope",
                "chat_id": sid,
                "workspace_scope": {"project_path": str(tmp_path / "ghost"), "access_mode": "restricted"},
            }
        )
        err = sock.receive_json()
        assert err.get("event") == "error"
        assert "workspace" in str(err.get("detail") or "").lower()


def test_runtime_page_mentions_workspace(client: TestClient) -> None:
    page = client.get("/ui/runtime.html")
    assert page.status_code == 200
    assert "Phase 0.5" in page.text
    assert "Workspaces" in page.text
