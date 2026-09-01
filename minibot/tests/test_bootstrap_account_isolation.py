"""Bootstrap must copy cookie account so sessions stay per-user."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from minibot.api.deps import AUTH_COOKIE_NAME


def _account(user_id: str, email: str) -> dict[str, str | None]:
    return {"id": user_id, "email": email, "name": user_id, "picture": None}


def test_bootstrap_copies_account_from_cookie(client: TestClient) -> None:
    state = client.app.state.app_state
    account = _account("user-alpha", "alpha@example.com")
    cookie_token = state.issue_token(account=account)

    res = client.get("/webui/bootstrap", cookies={AUTH_COOKIE_NAME: cookie_token})

    assert res.status_code == 200
    boot_token = res.json()["token"]
    assert boot_token != cookie_token
    assert state.token_account(boot_token) == account


def test_bootstrap_tokens_isolate_session_lists(client: TestClient, data_dir: Path) -> None:
    state = client.app.state.app_state
    cookie_a = state.issue_token(account=_account("user-alpha", "alpha@example.com"))
    cookie_b = state.issue_token(account=_account("user-beta", "beta@example.com"))

    boot_a = client.get("/webui/bootstrap", cookies={AUTH_COOKIE_NAME: cookie_a}).json()["token"]
    boot_b = client.get("/webui/bootstrap", cookies={AUTH_COOKIE_NAME: cookie_b}).json()["token"]
    headers_a = {"Authorization": f"Bearer {boot_a}"}
    headers_b = {"Authorization": f"Bearer {boot_b}"}

    created = client.post("/api/sessions", headers=headers_a, json={"title": "alpha-only"})
    assert created.status_code == 200
    session_id = created.json()["id"]

    listed_a = client.get("/api/sessions", headers=headers_a)
    listed_b = client.get("/api/sessions", headers=headers_b)
    assert listed_a.status_code == 200
    assert listed_b.status_code == 200
    assert any(item["id"] == session_id for item in listed_a.json()["sessions"])
    assert all(item["id"] != session_id for item in listed_b.json()["sessions"])

    assert (data_dir / "users" / "user-alpha" / "sessions").exists()
    assert not (data_dir / "users" / "user-beta" / "sessions" / f"{session_id}.jsonl").exists()


def test_session_default_workspace_is_under_user_root(client: TestClient, data_dir: Path) -> None:
    state = client.app.state.app_state
    cookie = state.issue_token(account=_account("user-delta", "delta@example.com"))
    boot = client.get("/webui/bootstrap", cookies={AUTH_COOKIE_NAME: cookie}).json()["token"]
    headers = {"Authorization": f"Bearer {boot}"}

    created = client.post("/api/sessions", headers=headers, json={"title": "delta-ws"})
    assert created.status_code == 200
    workspace_path = Path(created.json()["workspace_path"]).resolve()
    expected = (data_dir / "users" / "user-delta" / "workspace").resolve()
    assert workspace_path == expected
    assert (expected / "SOUL.md").is_file()
    assert "users/user-delta/workspace" in str(workspace_path)


def test_ws_chat_with_account_token_completes_turn(client: TestClient, data_dir: Path) -> None:
    """Bus worker must inherit user_id so WS turns resolve the per-user session store."""
    from minibot.api.deps import AUTH_COOKIE_NAME

    state = client.app.state.app_state
    cookie = state.issue_token(
        account={"id": "user-ws", "email": "ws@example.com", "name": "ws", "picture": None}
    )
    boot = client.get("/webui/bootstrap", cookies={AUTH_COOKIE_NAME: cookie}).json()["token"]
    headers = {"Authorization": f"Bearer {boot}"}
    created = client.post("/api/sessions", headers=headers, json={"title": "ws-user"})
    assert created.status_code == 200
    session_id = created.json()["id"]

    saw_idle = False
    with client.websocket_connect(f"/ws?token={boot}") as ws:
        assert ws.receive_json().get("event") == "ready"
        ws.send_json({"type": "message", "chat_id": session_id, "content": "ping via ws"})
        for _ in range(40):
            evt = ws.receive_json()
            if evt.get("event") == "goal_status" and evt.get("status") == "idle":
                saw_idle = True
                break
            if evt.get("event") == "error" and evt.get("detail") == "unknown_chat":
                raise AssertionError("bus worker lost user context: unknown_chat")

    assert saw_idle
    session_path = data_dir / "users" / "user-ws" / "sessions" / f"{session_id}.jsonl"
    assert session_path.is_file()
    text = session_path.read_text(encoding="utf-8")
    assert "ping via ws" in text
    assert "ok from fake provider" in text


def test_websocket_new_chat_uses_token_account(client: TestClient, data_dir: Path) -> None:
    state = client.app.state.app_state
    cookie = state.issue_token(account=_account("user-gamma", "gamma@example.com"))
    boot = client.get("/webui/bootstrap", cookies={AUTH_COOKIE_NAME: cookie}).json()["token"]

    with client.websocket_connect(f"/ws?token={boot}") as sock:
        ready = sock.receive_json()
        assert ready.get("event") == "ready"
        sock.send_json({"type": "new_chat"})
        attached = sock.receive_json()
        assert attached.get("event") == "attached"
        chat_id = attached["chat_id"]

    assert (data_dir / "users" / "user-gamma" / "sessions" / f"{chat_id}.jsonl").exists()
    assert not (data_dir / "users" / "system" / "sessions" / f"{chat_id}.jsonl").exists()


def test_websocket_fork_chat_copies_prefix(client: TestClient, data_dir: Path) -> None:
    from minibot.api.deps import bind_user_runtime_context

    state = client.app.state.app_state
    cookie = state.issue_token(account=_account("user-fork", "fork@example.com"))
    boot = client.get("/webui/bootstrap", cookies={AUTH_COOKIE_NAME: cookie}).json()["token"]
    headers = {"Authorization": f"Bearer {boot}"}

    created = client.post("/api/sessions", headers=headers, json={"title": "to-fork"})
    assert created.status_code == 200
    source_id = created.json()["id"]

    bind_user_runtime_context(state, "user-fork")
    seeded = state.sessions.get(source_id)
    assert seeded is not None
    state.sessions.append_messages(
        source_id,
        [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "world"},
            {"role": "user", "content": "again"},
            {"role": "assistant", "content": "ok"},
        ],
    )

    with client.websocket_connect(f"/ws?token={boot}") as sock:
        assert sock.receive_json().get("event") == "ready"
        sock.send_json(
            {
                "type": "fork_chat",
                "source_chat_id": f"websocket:{source_id}",
                "before_user_index": 1,
                "title": "Fork of to-fork",
            }
        )
        attached = sock.receive_json()
        assert attached.get("event") == "attached"
        fork_id = attached["chat_id"]
        assert fork_id != source_id

    thread = client.get(f"/api/sessions/{fork_id}/webui-thread", headers=headers)
    assert thread.status_code == 200
    body = thread.json()
    assert [m["content"] for m in body["messages"]] == ["hello", "world"]
    assert body.get("fork_boundary_message_count") == 2

    source_thread = client.get(f"/api/sessions/{source_id}/webui-thread", headers=headers)
    assert source_thread.status_code == 200
    assert len(source_thread.json()["messages"]) == 4

    assert (data_dir / "users" / "user-fork" / "sessions" / f"{fork_id}.jsonl").exists()
