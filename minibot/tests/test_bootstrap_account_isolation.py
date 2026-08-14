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
