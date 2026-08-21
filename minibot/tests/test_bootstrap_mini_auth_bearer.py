"""CLI / device-login: bootstrap accepts mini-auth Bearer access tokens."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def test_bootstrap_with_mini_auth_bearer_issues_account_token(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    state.settings.__dict__["mini_auth_base_url"] = "https://auth.example"
    state.settings.__dict__["require_auth"] = True
    state.settings.__dict__["auth_secret"] = ""

    userinfo = {
        "sub": "user-cli",
        "email": "cli@example.com",
        "preferred_username": "cli",
        "picture": None,
    }

    with patch(
        "minibot.api.routes.platform_proxy.fetch_mini_auth_userinfo",
        new=AsyncMock(return_value=userinfo),
    ) as mocked:
        res = client.get(
            "/webui/bootstrap",
            headers={"Authorization": "Bearer mini-access-token"},
        )

    assert res.status_code == 200
    mocked.assert_awaited_once()
    body = res.json()
    boot = body["token"]
    assert boot
    account = state.token_account(boot)
    assert account is not None
    assert account["id"] == "user-cli"
    assert account["email"] == "cli@example.com"


def test_bootstrap_rejects_invalid_mini_auth_bearer(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    state.settings.__dict__["require_auth"] = True
    state.settings.__dict__["auth_secret"] = ""

    from fastapi import HTTPException, status

    async def _boom(_state: Any, _token: str) -> dict[str, Any]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid mini-auth token")

    with patch(
        "minibot.api.routes.platform_proxy.fetch_mini_auth_userinfo",
        new=AsyncMock(side_effect=_boom),
    ):
        res = client.get(
            "/webui/bootstrap",
            headers={"Authorization": "Bearer bad-token"},
        )

    assert res.status_code == 401


def test_bootstrap_mini_auth_bearer_isolates_sessions(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    state.settings.__dict__["require_auth"] = True
    state.settings.__dict__["auth_secret"] = ""

    async def userinfo_for(_state: Any, token: str) -> dict[str, Any]:
        if token == "tok-a":
            return {"sub": "user-a", "email": "a@example.com", "name": "a"}
        return {"sub": "user-b", "email": "b@example.com", "name": "b"}

    with patch(
        "minibot.api.routes.platform_proxy.fetch_mini_auth_userinfo",
        new=AsyncMock(side_effect=userinfo_for),
    ):
        boot_a = client.get(
            "/webui/bootstrap",
            headers={"Authorization": "Bearer tok-a"},
        ).json()["token"]
        boot_b = client.get(
            "/webui/bootstrap",
            headers={"Authorization": "Bearer tok-b"},
        ).json()["token"]

    headers_a = {"Authorization": f"Bearer {boot_a}"}
    headers_b = {"Authorization": f"Bearer {boot_b}"}
    created = client.post("/api/sessions", headers=headers_a, json={"title": "a-only"})
    assert created.status_code == 200
    session_id = created.json()["id"]

    listed_a = client.get("/api/sessions", headers=headers_a).json()["sessions"]
    listed_b = client.get("/api/sessions", headers=headers_b).json()["sessions"]
    assert any(item["id"] == session_id for item in listed_a)
    assert all(item["id"] != session_id for item in listed_b)
