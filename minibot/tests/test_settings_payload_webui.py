"""WebUI Settings payload shape for slim Settings surface."""

from __future__ import annotations

from minibot.config.app_config import AppConfig, settings_public_payload


def test_settings_public_payload_has_overview_runtime_keys() -> None:
    payload = settings_public_payload(AppConfig(openai_api_key="sk-test-key-abcdefgh"))
    assert payload["agent"]["model"]
    assert payload["agent"]["bot_name"]
    assert payload["agent"]["timezone"]
    assert "runtime" in payload
    assert payload["runtime"]["gateway_host"]
    assert payload["runtime"]["gateway_port"]
    assert payload["runtime"]["workspace_path"]
    assert payload["runtime"]["config_path"]
    assert payload["usage"]["days"] == []
    assert payload["version"]["current"] == "minibot"
    assert payload["advanced"]["webui_allow_local_service_access"] is True
    assert payload["image_generation"]["enabled"] is False
    assert payload["image_generation"]["providers"] == []
    assert payload["transcription"]["provider_configured"] is False
    assert payload["transcription"]["providers"] == []
