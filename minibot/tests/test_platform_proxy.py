"""Tests for /platform/v1 cloud proxy routes."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from minibot.config import platform_models as pm
from minibot.config.settings import get_settings
from minibot.main import create_app


@pytest.fixture()
def proxy_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("MINIBOT_SERVER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MINIBOT_SERVER_DESKTOP_DAILY_TURN_LIMIT", "2")
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_API_KEY", "sk-test-platform")
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_BASE_URL", "https://upstream.example/v1")
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_MODEL", "deepseek-v4-flash")
    monkeypatch.setattr(pm, "_dotenv_map", lru_cache(maxsize=1)(lambda: {}))
    pm.clear_platform_env_cache()
    get_settings.cache_clear()
    app = create_app()
    with TestClient(app) as client:
        yield client
    get_settings.cache_clear()
    pm.clear_platform_env_cache()


@pytest.mark.asyncio
async def test_token_mint_and_chat(proxy_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_userinfo(state, access_token: str) -> dict[str, Any]:
        del state, access_token
        return {"sub": "user-desktop-1", "email": "a@example.com", "preferred_username": "alice"}

    monkeypatch.setattr(
        "minibot.api.routes.platform_proxy.fetch_mini_auth_userinfo",
        fake_userinfo,
    )

    r = proxy_client.post(
        "/platform/v1/token",
        headers={"Authorization": "Bearer mini-auth-token"},
    )
    assert r.status_code == 200, r.text
    platform_token = r.json()["access_token"]
    assert platform_token

    async def fake_post(self, url, **kwargs):  # noqa: ANN001
        del self
        assert "upstream.example" in url
        assert kwargs["headers"]["Authorization"] == "Bearer sk-test-platform"
        req = kwargs.get("json") or {}
        assert req.get("model") == "deepseek-v4-flash"
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-1",
                "choices": [{"message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    chat = proxy_client.post(
        "/platform/v1/chat/completions",
        headers={"Authorization": f"Bearer {platform_token}"},
        json={
            "model": "platform-deepseek-v4-flash",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": False,
        },
    )
    assert chat.status_code == 200, chat.text
    assert chat.json()["choices"][0]["message"]["content"] == "hi"
    assert "sk-test-platform" not in chat.text


def test_token_rejects_bad_mini_auth(proxy_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(state, access_token: str):
        del state, access_token
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid")

    monkeypatch.setattr(
        "minibot.api.routes.platform_proxy.fetch_mini_auth_userinfo",
        boom,
    )
    r = proxy_client.post(
        "/platform/v1/token",
        headers={"Authorization": "Bearer bad"},
    )
    assert r.status_code == 401


def test_budget_429(proxy_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_userinfo(state, access_token: str) -> dict[str, Any]:
        del state, access_token
        return {"sub": "user-budget", "email": "b@example.com"}

    monkeypatch.setattr(
        "minibot.api.routes.platform_proxy.fetch_mini_auth_userinfo",
        fake_userinfo,
    )
    token = proxy_client.post(
        "/platform/v1/token",
        headers={"Authorization": "Bearer mini"},
    ).json()["access_token"]

    async def fake_post(self, url, **kwargs):  # noqa: ANN001
        del self, kwargs
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"role": "assistant", "content": "x"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    body = {
        "model": "deepseek-v4-flash",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": False,
    }
    headers = {"Authorization": f"Bearer {token}"}
    assert proxy_client.post("/platform/v1/chat/completions", headers=headers, json=body).status_code == 200
    assert proxy_client.post("/platform/v1/chat/completions", headers=headers, json=body).status_code == 200
    third = proxy_client.post("/platform/v1/chat/completions", headers=headers, json=body)
    assert third.status_code == 429
    assert "sk-test" not in third.text


def test_chat_requires_platform_token(proxy_client: TestClient) -> None:
    r = proxy_client.post(
        "/platform/v1/chat/completions",
        json={"model": "deepseek-v4-flash", "messages": []},
    )
    assert r.status_code == 401
