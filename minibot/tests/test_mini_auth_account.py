"""mini-auth account propagation tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from minibot.api.deps import AUTH_COOKIE_NAME


def test_auth_config_returns_mini_auth_account(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    token = state.issue_token(
        account={
            "id": "user-demo",
            "email": "demo@mini-auth.dev",
            "name": "demo",
            "picture": None,
            "created_at": "2026-08-11T00:00:00Z",
        }
    )

    res = client.get("/auth/config", cookies={AUTH_COOKIE_NAME: token})

    assert res.status_code == 200
    assert res.json()["account"] == {
        "id": "user-demo",
        "email": "demo@mini-auth.dev",
        "name": "demo",
        "picture": None,
        "created_at": "2026-08-11T00:00:00Z",
    }
