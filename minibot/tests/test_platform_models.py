"""Platform builtin catalog + activate without persisting platform keys."""

from __future__ import annotations

from functools import lru_cache

import pytest

from minibot.config.app_config import AppConfig, apply_settings_update, SettingsUpdate, settings_public_payload
from minibot.config.platform_models import (
    PLATFORM_MODELS,
    apply_auto_model,
    apply_platform_model,
    effective_chat_model,
    find_platform_model,
    platform_models_public,
    resolve_platform_runtime,
)

_SLOTS = ("openai", "deepseek_pro", "qwen", "glm", "kimi", "minimax", "doubao")


@pytest.fixture(autouse=True)
def _clear_slot_env(monkeypatch: pytest.MonkeyPatch) -> None:
    from minibot.config import platform_models as pm

    for slot in _SLOTS:
        for suffix in ("API_KEY", "BASE_URL", "MODEL"):
            monkeypatch.delenv(f"MINIBOT_SERVER_{slot.upper()}_{suffix}", raising=False)
    monkeypatch.delenv("MINIBOT_SERVER_MODEL", raising=False)
    monkeypatch.delenv("MINIBOT_SERVER_DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    # Avoid picking up the developer's real minibot/.env during unit tests.
    monkeypatch.setattr(pm, "_dotenv_map", lru_cache(maxsize=1)(lambda: {}))
    pm.clear_platform_env_cache()
    yield
    pm.clear_platform_env_cache()


def test_catalog_includes_env_slots() -> None:
    slots = {m.slot for m in PLATFORM_MODELS}
    assert set(_SLOTS) <= slots
    doubao = next(m for m in PLATFORM_MODELS if m.slot == "doubao")
    assert doubao.backend == "anthropic"


def test_platform_models_load_from_slot_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_API_KEY", "sk-oa")
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_BASE_URL", "https://api.deepseek.com/v1")
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_MODEL", "deepseek-v4-flash")
    monkeypatch.setenv("MINIBOT_SERVER_QWEN_API_KEY", "sk-qw")
    monkeypatch.setenv("MINIBOT_SERVER_QWEN_BASE_URL", "https://qwen.example/v1")
    monkeypatch.setenv("MINIBOT_SERVER_QWEN_MODEL", "qwen3.7-plus")

    rows = {r["id"]: r for r in platform_models_public()}
    assert rows["platform-deepseek-v4-flash"]["available"] is True
    assert rows["platform-deepseek-v4-flash"]["model"] == "deepseek-v4-flash"
    assert rows["platform-qwen3.7-plus"]["available"] is True
    assert rows["platform-qwen3.7-plus"]["api_base"] == "https://qwen.example/v1"
    assert rows["platform-glm-5.2"]["available"] is False
    assert rows["platform-doubao-seed-2.0-lite"]["backend"] == "anthropic"
    assert rows["platform-doubao-seed-2.0-lite"]["available"] is False


def test_openai_slot_falls_back_to_global_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_API_KEY", "sk-oa")
    monkeypatch.setenv("MINIBOT_SERVER_MODEL", "deepseek-v4-flash")
    rt = resolve_platform_runtime("platform-deepseek-v4-flash")
    assert rt is not None
    assert rt.model == "deepseek-v4-flash"


def test_settings_payload_includes_platform_models(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_API_KEY", "sk-oa")
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_MODEL", "deepseek-v4-flash")
    payload = settings_public_payload(AppConfig(openai_api_key="", provider="custom"))
    assert len(payload["platform_models"]) == len(PLATFORM_MODELS)
    assert any(r["available"] for r in payload["platform_models"])


def test_apply_platform_model_does_not_store_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_DEEPSEEK_PRO_API_KEY", "sk-platform-secret")
    monkeypatch.setenv("MINIBOT_SERVER_DEEPSEEK_PRO_BASE_URL", "https://api.deepseek.com/v1")
    monkeypatch.setenv("MINIBOT_SERVER_DEEPSEEK_PRO_MODEL", "deepseek-v4-pro")
    config = AppConfig(openai_api_key="")
    apply_platform_model(config, "platform-deepseek-v4-pro")
    assert config.model == "deepseek-v4-pro"
    assert config.provider == "custom"
    assert config.active_platform_model == "platform-deepseek-v4-pro"
    assert config.openai_api_key == ""
    assert "sk-platform-secret" not in str(config.model_dump())


def test_apply_doubao_uses_anthropic_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_DOUBAO_API_KEY", "ark-test")
    monkeypatch.setenv(
        "MINIBOT_SERVER_DOUBAO_BASE_URL",
        "https://ark.cn-beijing.volces.com/api/coding",
    )
    monkeypatch.setenv("MINIBOT_SERVER_DOUBAO_MODEL", "doubao-seed-2.0-lite")
    config = AppConfig(openai_api_key="")
    apply_platform_model(config, "platform-doubao-seed-2.0-lite")
    assert config.provider == "anthropic"
    assert config.model == "doubao-seed-2.0-lite"
    assert config.openai_base_url == "https://ark.cn-beijing.volces.com/api/coding"
    assert config.openai_api_key == ""
    rt = resolve_platform_runtime("platform-doubao-seed-2.0-lite")
    assert rt is not None
    assert rt.backend == "anthropic"
    assert rt.provider == "anthropic"


def test_apply_unavailable_platform_model_raises() -> None:
    config = AppConfig(openai_api_key="")
    with pytest.raises(KeyError, match="unavailable"):
        apply_platform_model(config, "platform-qwen3.7-plus")


def test_find_platform_model_unknown() -> None:
    assert find_platform_model("nope") is None


def test_auto_mode_ignores_stale_config_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_API_KEY", "sk-oa")
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_BASE_URL", "https://api.deepseek.com/v1")
    monkeypatch.setenv("MINIBOT_SERVER_OPENAI_MODEL", "deepseek-v4-flash")
    monkeypatch.setenv("MINIBOT_SERVER_MINIMAX_API_KEY", "sk-mm")
    monkeypatch.setenv("MINIBOT_SERVER_MINIMAX_BASE_URL", "https://ark.example/v3")
    monkeypatch.setenv("MINIBOT_SERVER_MINIMAX_MODEL", "minimax-m3")

    config = AppConfig(
        provider="custom",
        model="minimax-m3",
        openai_base_url="https://ark.example/v3",
        openai_api_key="",
        active_platform_model="platform-minimax-m3",
    )
    apply_auto_model(config)
    assert config.provider == "auto"
    assert config.active_platform_model == ""
    assert config.model == "deepseek-v4-flash"
    assert config.openai_base_url == "https://api.deepseek.com/v1"
    assert effective_chat_model(config) == "deepseek-v4-flash"

    # Stale model left behind must not win while provider stays auto.
    config.model = "minimax-m3"
    config.openai_base_url = "https://api.deepseek.com/v1"
    assert effective_chat_model(config) == "deepseek-v4-flash"

    updated = apply_settings_update(config, SettingsUpdate(provider="auto"))
    assert updated.provider == "auto"
    assert updated.model == "deepseek-v4-flash"
    assert updated.openai_base_url == "https://api.deepseek.com/v1"
