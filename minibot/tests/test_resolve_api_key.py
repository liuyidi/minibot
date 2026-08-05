"""Tests for platform vs user API key resolution."""

from __future__ import annotations

import os

import pytest

from minibot.config.keys import configured_via, platform_env_key, resolve_api_key


@pytest.fixture(autouse=True)
def _clear_provider_key_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(os.environ):
        if key.endswith("_API_KEY") or key.startswith("MINIBOT_SERVER_") and key.endswith("_API_KEY"):
            monkeypatch.delenv(key, raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("MINIBOT_SERVER_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("MINIBOT_SERVER_DEEPSEEK_API_KEY", raising=False)


def test_platform_env_key_prefers_minibot_server_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_DEEPSEEK_API_KEY", "sk-platform-ds")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-legacy-ds")
    assert platform_env_key("deepseek") == "sk-platform-ds"


def test_platform_env_key_falls_back_to_registry_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-legacy-ds")
    assert platform_env_key("deepseek") == "sk-legacy-ds"


def test_platform_env_key_openai_compat_shared_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_API_KEY", "sk-shared")
    assert platform_env_key("deepseek") == "sk-shared"


def test_resolve_api_key_user_beats_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_DEEPSEEK_API_KEY", "sk-platform")
    assert resolve_api_key("deepseek", user_key="sk-user") == "sk-user"


def test_resolve_api_key_uses_platform_when_user_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_DEEPSEEK_API_KEY", "sk-platform")
    assert resolve_api_key("deepseek", user_key="") == "sk-platform"
    assert resolve_api_key("deepseek") == "sk-platform"


def test_resolve_api_key_empty_when_nothing_set() -> None:
    assert resolve_api_key("deepseek") == ""
    assert resolve_api_key("auto") == ""


def test_configured_via_both_user_and_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_API_KEY", "sk-plat")
    assert configured_via("openai", user_key="sk-user") == "both"
    assert configured_via("openai", user_key="") == "platform"
    assert configured_via("openai", user_key="sk-user") == "both"


def test_configured_via_user_only() -> None:
    assert configured_via("openai", user_key="sk-user") == "user"
    assert configured_via("openai", user_key="") is None
