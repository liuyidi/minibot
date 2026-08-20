"""mini-auth account propagation tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from minibot.api.deps import AUTH_COOKIE_NAME
from minibot.api.routes.auth import account_from_mini_auth_userinfo


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


def test_account_from_userinfo_sets_github_bound_and_display_name() -> None:
    account = account_from_mini_auth_userinfo(
        {
            "sub": "user-1",
            "email": "a@example.com",
            "preferred_username": "Ada",
            "picture": None,
            "created_at": "2026-08-11T00:00:00Z",
            "identities": [{"provider": "github", "display_name": "octocat"}],
        }
    )
    assert account["github_bound"] == "true"
    assert account["github_display_name"] == "octocat"
    assert account["google_bound"] == "false"
    assert account.get("google_display_name") in (None, "")


def test_account_from_userinfo_sets_google_bound_and_display_name() -> None:
    account = account_from_mini_auth_userinfo(
        {
            "sub": "user-1",
            "email": "a@example.com",
            "preferred_username": "Ada",
            "picture": None,
            "created_at": "2026-08-11T00:00:00Z",
            "identities": [{"provider": "google", "display_name": "Ada G"}],
        }
    )
    assert account["google_bound"] == "true"
    assert account["google_display_name"] == "Ada G"
    assert account["github_bound"] == "false"


def test_account_from_userinfo_unbound_when_no_github() -> None:
    account = account_from_mini_auth_userinfo(
        {
            "sub": "user-1",
            "email": "a@example.com",
            "identities": [],
        }
    )
    assert account["github_bound"] == "false"
    assert account.get("github_display_name") in (None, "")
    assert account["google_bound"] == "false"
    assert account.get("google_display_name") in (None, "")


def test_auth_config_returns_github_account_fields(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    token = state.issue_token(
        account={
            "id": "user-demo",
            "email": "demo@mini-auth.dev",
            "name": "demo",
            "picture": None,
            "created_at": "2026-08-11T00:00:00Z",
            "github_bound": "true",
            "github_display_name": "octocat",
            "google_bound": "true",
            "google_display_name": "Ada G",
        }
    )
    res = client.get("/auth/config", cookies={AUTH_COOKIE_NAME: token})
    assert res.status_code == 200
    assert res.json()["account"]["github_bound"] == "true"
    assert res.json()["account"]["github_display_name"] == "octocat"
    assert res.json()["account"]["google_bound"] == "true"
    assert res.json()["account"]["google_display_name"] == "Ada G"
