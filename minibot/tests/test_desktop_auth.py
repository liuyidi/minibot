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


def test_desktop_authorize_returns_custom_scheme_url(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    state.settings.__dict__["mini_auth_base_url"] = "https://auth.example"
    state.settings.__dict__["mini_auth_desktop_redirect_uri"] = "minibot://auth/callback"

    res = client.get("/auth/desktop/authorize?next=%2F")
    assert res.status_code == 200
    body = res.json()
    assert "authorize_url" in body
    location = body["authorize_url"]
    assert location.startswith("https://auth.example/oauth/authorize?")
    params = parse_qs(urlparse(location).query)
    assert params["redirect_uri"] == ["minibot://auth/callback"]


def test_desktop_login_with_handoff_id_uses_http_callback(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    state.settings.__dict__["mini_auth_base_url"] = "https://auth.example"
    state.settings.__dict__["mini_auth_callback_path"] = "/auth/mini-auth/callback"

    res = client.get(
        "/auth/login?desktop=1&desktop_login_id=desk-1&next=%2F",
        follow_redirects=False,
    )

    assert res.status_code == 302
    params = parse_qs(urlparse(res.headers["location"]).query)
    assert params["redirect_uri"][0].endswith("/auth/mini-auth/callback")
    login_state = params["state"][0]
    record = state.mini_auth_logins[login_state]
    assert record.desktop_login_id == "desk-1"


def test_desktop_http_callback_stores_handoff(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    state.settings.__dict__["mini_auth_base_url"] = "https://auth.example"

    login_state, _verifier = state.begin_mini_auth_login(
        "/",
        redirect_uri="http://testserver/auth/mini-auth/callback",
        desktop_login_id="desk-poll",
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
        done = client.get(
            f"/auth/mini-auth/callback?code=auth-code&state={login_state}",
            follow_redirects=False,
        )

    assert done.status_code == 302
    assert done.headers["location"] == "/auth/desktop/done"

    missing = client.get("/auth/desktop/handoff?id=wrong")
    assert missing.status_code == 404

    handoff = client.get("/auth/desktop/handoff?id=desk-poll")
    assert handoff.status_code == 200
    body = handoff.json()
    assert body["token"]
    assert body["next_url"] == "/"
    assert client.get("/auth/desktop/handoff?id=desk-poll").status_code == 404


def test_desktop_done_page_serves_html(client: TestClient) -> None:
    res = client.get("/auth/desktop/done")
    assert res.status_code == 200
    assert "登录成功" in res.text
    assert "minibot://auth/done" in res.text


def test_logout_local_clears_cookie_without_idp_redirect(client: TestClient) -> None:
    state = client.app.state.app_state
    state.settings.__dict__["auth_provider"] = "mini_auth"
    state.settings.__dict__["mini_auth_base_url"] = "https://auth.example"
    token = state.issue_token(account={"id": "u1", "email": "a@b.c"})
    client.cookies.set(AUTH_COOKIE_NAME, token)

    res = client.get("/auth/logout?local=1", follow_redirects=False)
    assert res.status_code == 204
    assert not state.check_token(token)
    # Set-Cookie delete is present (empty value / expired) with matching flags.
    set_cookies = res.headers.get_list("set-cookie")
    assert any(AUTH_COOKIE_NAME in v for v in set_cookies)
    joined = "\n".join(set_cookies).lower()
    assert "httponly" in joined
    assert "samesite=lax" in joined


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
