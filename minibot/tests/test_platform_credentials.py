"""Local platform credentials + proxy-mode availability."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from minibot.config.app_config import AppConfig, settings_public_payload
from minibot.config.platform_credentials import (
    PlatformCredentials,
    ensure_platform_token_sync,
    load_platform_credentials,
    save_platform_credentials,
)
from minibot.config.platform_models import (
    PLATFORM_MODELS,
    platform_models_public,
    resolve_platform_runtime_proxied,
)
from minibot.config.settings import get_settings
from minibot.providers.factory import build_provider_chain
from minibot.providers.openai_compat import OpenAICompatProvider


def test_save_load_credentials(tmp_path: Path) -> None:
    creds = PlatformCredentials(
        mini_auth_access_token="mini",
        access_token="plat",
        expires_at=9_999_999_999,
    )
    save_platform_credentials(tmp_path, creds)
    loaded = load_platform_credentials(tmp_path)
    assert loaded is not None
    assert loaded.access_token == "plat"
    assert loaded.platform_token_valid is True


def test_proxy_catalog_available_without_local_env(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = platform_models_public(
        proxy_base_url="https://bot.example",
        proxy_token="tok",
    )
    assert len(rows) == len(PLATFORM_MODELS)
    assert all(r["available"] for r in rows)
    assert all(r["api_base"].endswith("/platform/v1") for r in rows)


def test_proxy_catalog_unavailable_without_token() -> None:
    rows = platform_models_public(proxy_base_url="https://bot.example", proxy_token="")
    assert all(not r["available"] for r in rows)


def test_factory_uses_proxy_base_and_token() -> None:
    config = AppConfig(
        provider="custom",
        active_platform_model="platform-deepseek-v4-flash",
        openai_api_key="",
    )
    provider = build_provider_chain(
        config,
        proxy_base_url="https://bot.example",
        proxy_token="desktop-tok",
    )
    assert isinstance(provider, OpenAICompatProvider)
    assert provider.api_key == "desktop-tok"
    assert provider.base_url.rstrip("/").endswith("/platform/v1")


def test_ensure_token_sync_exchange(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(self, url, **kwargs):  # noqa: ANN001
        del self
        assert url.endswith("/platform/v1/token")
        assert kwargs["headers"]["Authorization"] == "Bearer mini-1"
        return httpx.Response(
            200,
            json={"access_token": "plat-1", "expires_in": 3600, "token_type": "bearer"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.Client, "post", fake_post)
    creds = ensure_platform_token_sync(
        tmp_path,
        proxy_base_url="https://bot.example",
        mini_auth_access_token="mini-1",
    )
    assert creds.access_token == "plat-1"
    assert load_platform_credentials(tmp_path).access_token == "plat-1"


def test_settings_payload_proxy_mode(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MINIBOT_SERVER_PLATFORM_PROXY_BASE_URL", "https://bot.example")
    get_settings.cache_clear()
    save_platform_credentials(
        tmp_path / "users" / "system",
        PlatformCredentials(
            mini_auth_access_token="m",
            access_token="tok",
            expires_at=9_999_999_999,
        ),
    )
    # system user root is users/system under data_dir
    from minibot.user_runtime import resolve_user_root

    root = resolve_user_root(get_settings(), "system")
    save_platform_credentials(
        root,
        PlatformCredentials(
            mini_auth_access_token="m",
            access_token="tok",
            expires_at=9_999_999_999,
        ),
    )
    payload = settings_public_payload(AppConfig())
    assert any(r["available"] for r in payload["platform_models"])
    get_settings.cache_clear()


def test_proxied_runtime_shape() -> None:
    rt = resolve_platform_runtime_proxied(
        "platform-deepseek-v4-flash",
        proxy_base_url="https://bot.liuyidi.me",
        proxy_token="x",
    )
    assert rt is not None
    assert rt.available
    assert rt.backend == "openai_compat"
    assert rt.api_base == "https://bot.liuyidi.me/platform/v1"
