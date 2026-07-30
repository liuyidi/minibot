"""Tests for optional mini-langfuse adapter (no-op + enabled soft path)."""

from __future__ import annotations

from typing import Any

import pytest

from minibot.config.settings import Settings, get_settings
from minibot.observability import langfuse as lf


@pytest.fixture(autouse=True)
def _reset_langfuse() -> Any:
    lf.shutdown()
    yield
    lf.shutdown()


def test_disabled_by_default() -> None:
    lf.init_from_settings(Settings(langfuse_enabled=False))
    assert lf.is_enabled() is False
    with lf.turn_trace(name="t", session_id="s") as tr:
        tr.update(output="x")
        assert tr.id == ""
    with lf.observation(as_type="generation", name="g", model="m") as span:
        span.update(output="y")
        assert span.id == ""


def test_usage_dict_filters() -> None:
    assert lf.usage_dict(None) is None
    assert lf.usage_dict({}) is None
    assert lf.usage_dict({"prompt_tokens": 1, "completion_tokens": 2, "extra": 9}) == {
        "prompt_tokens": 1,
        "completion_tokens": 2,
    }


def test_enabled_without_keys_stays_disabled() -> None:
    lf.init_from_settings(
        Settings(
            langfuse_enabled=True,
            langfuse_public_key="",
            langfuse_secret_key="",
        )
    )
    assert lf.is_enabled() is False


def test_settings_fields_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "MINIBOT_SERVER_LANGFUSE_ENABLED",
        "MINIBOT_SERVER_LANGFUSE_HOST",
        "MINIBOT_SERVER_LANGFUSE_PUBLIC_KEY",
        "MINIBOT_SERVER_LANGFUSE_SECRET_KEY",
    ):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    s = Settings(_env_file=None)
    assert s.langfuse_enabled is False
    assert s.langfuse_host == "http://localhost:8000"
    assert s.langfuse_public_key == "pk-lf-demo"
