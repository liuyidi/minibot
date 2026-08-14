"""Desktop mini-auth callback helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from minibot.api.deps import AUTH_COOKIE_NAME


def test_desktop_login_uses_custom_scheme_redirect(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    state.settings.__dict__["mini_auth_base_url"] = "https://auth.example"
    state.settings.__dict__["mini_auth_desktop_redirect_uri"] = "minibot://auth/callback"

    res = client.get("/auth/login?desktop=1&next=%2Fchat", follow_redirects=False)

    assert res.status_code == 302
    location = res.headers["location"]
    assert location.startswith("https://auth.example/oauth/authorize?")
    params = parse_qs(urlparse(location).query)
    assert params["redirect_uri"] == ["minibot://auth/callback"]
    assert params["state"][0]
    assert params["code_challenge"][0]


def test_desktop_complete_exchanges_code_and_session_sets_cookie(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    state.settings.__dict__["mini_auth_base_url"] = "https://auth.example"
    state.settings.__dict__["mini_auth_desktop_redirect_uri"] = "minibot://auth/callback"

    login_state, _verifier = state.begin_mini_auth_login(
        "/threads",
        redirect_uri="minibot://auth/callback",
    )

    token_json = {"access_token": "at-1", "expires_in": 3600}
    userinfo = {
        "sub": "user-desk",
        "email": "desk@example.com",
        "preferred_username": "desk",
        "created_at": "2026-08-14T00:00:00Z",
        "identities": [],
    }

    mock_client = MagicMock()
    mock_token = MagicMock()
    mock_token.raise_for_status = MagicMock()
    mock_token.json.return_value = token_json
    mock_user = MagicMock()
    mock_user.raise_for_status = MagicMock()
    mock_user.json.return_value = userinfo
    mock_client.post = AsyncMock(return_value=mock_token)
    mock_client.get = AsyncMock(return_value=mock_user)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("minibot.api.routes.auth.httpx.AsyncClient", return_value=mock_client):
        complete = client.post(
            "/auth/desktop/complete",
            json={"code": "auth-code", "state": login_state},
        )

    assert complete.status_code == 200
    body = complete.json()
    assert body["token"]
    assert body["expires_in"] == 3600
    assert body["next_url"] == "/threads"
    mock_client.post.assert_awaited()
    assert mock_client.post.await_args.kwargs["json"]["redirect_uri"] == "minibot://auth/callback"

    session = client.get(
        f"/auth/desktop/session?token={body['token']}&next=%2Fthreads",
        follow_redirects=False,
    )
    assert session.status_code == 302
    assert session.headers["location"] == "/threads"
    assert AUTH_COOKIE_NAME in session.cookies
