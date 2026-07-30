"""Phase 6a: model presets unit tests."""

from __future__ import annotations

import pytest

from fastapi.testclient import TestClient

from minibot.config.app_config import AppConfig, apply_settings_update, load_app_config, SettingsUpdate
from minibot.config.presets import (
    PresetError,
    activate_preset,
    delete_preset,
    ensure_presets,
    mask_key,
    upsert_preset,
)


def test_mask_key() -> None:
    assert mask_key("") == ""
    assert mask_key("short") == "****"
    assert mask_key("sk-abcdefghijklmnop") == "sk-a…mnop"


def test_ensure_presets_seeds_default() -> None:
    cfg = AppConfig(
        model="deepseek-v4-flash",
        openai_api_key="sk-test-key-123456",
        openai_base_url="https://api.deepseek.com/v1",
        model_presets=[],
    )
    ensure_presets(cfg)
    assert len(cfg.model_presets) == 1
    assert cfg.active_preset == "default"
    assert cfg.model_presets[0].model == "deepseek-v4-flash"
    assert cfg.model_presets[0].api_key.startswith("sk-")


def test_activate_preset_copies_live_fields() -> None:
    cfg = AppConfig(
        model="a",
        openai_api_key="key-aaaa-1111",
        openai_base_url="https://a.example/v1",
    )
    ensure_presets(cfg)
    upsert_preset(
        cfg,
        preset_id="openai",
        label="OpenAI",
        model="gpt-4o-mini",
        api_key="key-bbbb-2222",
        api_base="https://api.openai.com/v1",
    )
    activate_preset(cfg, "openai")
    assert cfg.active_preset == "openai"
    assert cfg.model == "gpt-4o-mini"
    assert cfg.openai_api_key == "key-bbbb-2222"
    assert cfg.openai_base_url == "https://api.openai.com/v1"


def test_activate_requires_key_and_base() -> None:
    cfg = AppConfig(openai_api_key="k", openai_base_url="https://x")
    ensure_presets(cfg)
    cfg.model_presets[0] = cfg.model_presets[0].model_copy(update={"api_key": ""})
    with pytest.raises(PresetError, match="api_key"):
        activate_preset(cfg, "default")


def test_upsert_keeps_key_when_empty() -> None:
    cfg = AppConfig(openai_api_key="keep-me-12345678", openai_base_url="https://x")
    ensure_presets(cfg)
    upsert_preset(cfg, preset_id="default", model="m2", api_key="", api_base="https://x")
    assert find_key(cfg) == "keep-me-12345678"


def find_key(cfg: AppConfig) -> str:
    return cfg.model_presets[0].api_key


def test_delete_last_fails() -> None:
    cfg = AppConfig(openai_api_key="k", openai_base_url="https://x")
    ensure_presets(cfg)
    with pytest.raises(PresetError, match="last"):
        delete_preset(cfg, "default")


def test_delete_active_switches() -> None:
    cfg = AppConfig(openai_api_key="k1", openai_base_url="https://a")
    ensure_presets(cfg)
    upsert_preset(
        cfg,
        preset_id="b",
        label="B",
        model="m-b",
        api_key="k2-xxxxxx",
        api_base="https://b",
        activate=True,
    )
    assert cfg.active_preset == "b"
    delete_preset(cfg, "b")
    assert cfg.active_preset == "default"
    assert cfg.model_presets[0].id == "default"


def test_patch_syncs_active_preset() -> None:
    cfg = AppConfig(openai_api_key="old-key-zzzz", openai_base_url="https://old")
    ensure_presets(cfg)
    cfg = apply_settings_update(
        cfg,
        SettingsUpdate(model="new-model", openai_base_url="https://new"),
    )
    assert cfg.model == "new-model"
    assert cfg.model_presets[0].model == "new-model"
    assert cfg.model_presets[0].api_base == "https://new"


def test_load_migrates_legacy_file(tmp_path, monkeypatch) -> None:
    from minibot.config import settings as settings_mod

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    cfg_path = data_dir / "config.json"
    cfg_path.write_text(
        '{"model":"m1","openai_api_key":"sk-legacy-key99","openai_base_url":"https://legacy/v1"}',
        encoding="utf-8",
    )
    monkeypatch.setenv("MINIBOT_SERVER_DATA_DIR", str(data_dir))
    settings_mod.get_settings.cache_clear()
    loaded = load_app_config(cfg_path)
    assert loaded.active_preset == "default"
    assert len(loaded.model_presets) == 1
    assert loaded.model_presets[0].api_base == "https://legacy/v1"
    settings_mod.get_settings.cache_clear()


def test_settings_api_presets_crud(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/settings/model-configurations",
        headers=auth_headers,
        json={
            "id": "openai",
            "label": "OpenAI",
            "model": "gpt-4o-mini",
            "api_key": "sk-openai-test-aaaa",
            "api_base": "https://api.openai.com/v1",
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert any(p["id"] == "openai" for p in body["model_presets"])
    assert "sk-openai-test-aaaa" not in str(body)

    activated = client.post(
        "/api/settings/model-configurations/openai/activate",
        headers=auth_headers,
    )
    assert activated.status_code == 200
    assert activated.json()["active_preset"] == "openai"
    assert activated.json()["agent"]["model"] == "gpt-4o-mini"

    dev = client.get("/api/dev/providers", headers=auth_headers)
    assert dev.status_code == 200
    assert dev.json()["active"]["model"] == "gpt-4o-mini"
    assert "aaaa" in (dev.json()["active"]["api_key_masked"] or "")

    deleted = client.delete(
        "/api/settings/model-configurations/openai",
        headers=auth_headers,
    )
    assert deleted.status_code == 200
    assert deleted.json()["active_preset"] != "openai"


def test_activate_missing_key_400(client: TestClient, auth_headers: dict[str, str]) -> None:
    # Create then wipe key via internal path is hard; create incomplete via upsert fail:
    bad = client.post(
        "/api/settings/model-configurations",
        headers=auth_headers,
        json={"id": "bad", "label": "Bad", "model": "m", "api_base": "https://x", "api_key": ""},
    )
    assert bad.status_code == 400
