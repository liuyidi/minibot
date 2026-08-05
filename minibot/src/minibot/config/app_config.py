"""Persisted app config (settings) for the FastAPI server."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from minibot.config.presets import (
    ModelPreset,
    apply_live_to_active_preset,
    ensure_presets,
    mask_key,
    presets_public_list,
)
from minibot.config.mcp_presets import McpPreset, presets_public_list as mcp_presets_public_list
from minibot.config.settings import Settings, get_settings
from minibot.channels.feishu_setup import FeishuPersistedConfig
from minibot.providers.registry import list_providers


def _providers_public(config: AppConfig) -> list[dict[str, Any]]:
    active = (config.provider or "openai").strip() or "openai"
    key = config.openai_api_key
    masked = mask_key(key)
    out: list[dict[str, Any]] = []
    for spec in list_providers(include_stubs=True):
        name = str(spec["name"])
        is_active = name == active
        out.append(
            {
                "name": name,
                "label": spec["label"],
                "backend": spec["backend"],
                "implemented": spec["implemented"],
                "configured": bool(key) if is_active else False,
                "auth_type": "api_key",
                "api_key_required": name not in {"ollama"},
                "api_key_hint": masked if is_active else None,
                "api_base": config.openai_base_url if is_active else spec["default_api_base"],
                "default_api_base": spec["default_api_base"],
                "model_selectable": True,
                "api_type": "messages" if spec["backend"] == "anthropic" else "chat_completions",
                "notes": spec.get("notes") or "",
            }
        )
    return out


class AppConfig(BaseModel):
    model: str = "gpt-4o-mini"
    provider: str = "openai"
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    temperature: float = 0.2
    max_iterations: int = 8
    bot_name: str = "minibot"
    timezone: str = "UTC"
    # Phase 3a compaction (message count threshold; 0 = disabled)
    compact_threshold: int = 40
    compact_keep_recent: int = 16
    context_window_tokens: int = 128_000
    # Phase 6a: named OpenAI-compat presets
    active_preset: str = "default"
    model_presets: list[ModelPreset] = Field(default_factory=list)
    # Phase 5: MCP server presets
    mcp_presets: list[McpPreset] = Field(default_factory=list)
    # Phase 15: Feishu channel (QR setup + pairing)
    feishu: FeishuPersistedConfig = Field(default_factory=FeishuPersistedConfig)


def default_config_from_settings(settings: Settings | None = None) -> AppConfig:
    settings = settings or get_settings()
    config = AppConfig(
        model=settings.model,
        openai_api_key=settings.resolved_api_key(),
        openai_base_url=settings.openai_base_url,
        temperature=settings.temperature,
        max_iterations=settings.max_iterations,
    )
    return ensure_presets(config)


def load_app_config(path: Path | None = None) -> AppConfig:
    settings = get_settings()
    config_path = path or settings.resolved_config_path()
    if not config_path.exists():
        return default_config_from_settings(settings)
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
        config = AppConfig.model_validate(data)
    except (OSError, json.JSONDecodeError, ValueError):
        return default_config_from_settings(settings)
    return ensure_presets(config)


def save_app_config(config: AppConfig, path: Path | None = None) -> None:
    settings = get_settings()
    config_path = path or settings.resolved_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    ensure_presets(config)
    config_path.write_text(
        json.dumps(config.model_dump(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


class SettingsUpdate(BaseModel):
    model: str | None = None
    provider: str | None = None
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    temperature: float | None = None
    max_iterations: int | None = None
    bot_name: str | None = None
    timezone: str | None = None
    active_preset: str | None = None


def apply_settings_update(config: AppConfig, update: SettingsUpdate) -> AppConfig:
    data = config.model_dump()
    for key, value in update.model_dump(exclude_none=True).items():
        data[key] = value
    next_config = AppConfig.model_validate(data)
    ensure_presets(next_config)
    if update.active_preset is None:
        apply_live_to_active_preset(next_config)
    return next_config


def feishu_public_payload(feishu: FeishuPersistedConfig) -> dict[str, Any]:
    connected = bool(feishu.app_id and feishu.app_secret and feishu.enabled)
    return {
        "enabled": feishu.enabled,
        "connected": connected,
        "app_id": feishu.app_id,
        "has_app_secret": bool(feishu.app_secret),
        "app_secret_masked": "••••••••" if feishu.app_secret else "",
        "bot_name": feishu.bot_name,
        "domain": feishu.domain,
        "dm_policy": feishu.dm_policy,
        "allow_from_count": len(feishu.allow_from),
        "group_policy": feishu.group_policy,
    }


def settings_public_payload(config: AppConfig) -> dict[str, Any]:
    """Shape compatible enough for the existing WebUI SettingsView."""
    from minibot.config.settings import get_settings
    from minibot.workspace import default_workspace

    ensure_presets(config)
    key = config.openai_api_key
    masked = mask_key(key)
    presets = presets_public_list(config)
    runtime = get_settings()
    return {
        "surface": "browser",
        "runtime_surface": "browser",
        "runtime_capabilities": {
            "workspace_controls": False,
            "native_engine_restart": False,
        },
        "requires_restart": False,
        "active_preset": config.active_preset,
        "agent": {
            "model": config.model,
            "provider": config.provider,
            "resolved_provider": config.provider,
            "has_api_key": bool(key),
            "model_preset": config.active_preset,
            "max_tokens": 4096,
            "context_window_tokens": getattr(config, "context_window_tokens", 128000) or 128000,
            "temperature": config.temperature,
            "reasoning_effort": None,
            "timezone": config.timezone,
            "bot_name": config.bot_name,
            "bot_icon": "nb",
            "tool_hint_max_length": 80,
            "exec_sandbox": runtime.normalized_exec_backend(),
        },
        "model_presets": presets,
        "mcp_presets": mcp_presets_public_list(config),
        "channels": {
            "feishu": feishu_public_payload(config.feishu),
        },
        "providers": _providers_public(config),
        "web_search": {
            "provider": "none",
            "max_results": 5,
            "timeout": 30,
            "providers": [],
        },
        "web": {
            "enable": False,
            "search": {"max_results": 5, "timeout": 30},
            "fetch": {"use_jina_reader": False},
        },
        "image_generation": {
            "enabled": False,
            "provider": "openai",
            "provider_configured": False,
            "model": "",
            "default_aspect_ratio": "1:1",
            "default_image_size": "1024x1024",
            "max_images_per_turn": 1,
            "save_dir": "",
            "providers": [],
        },
        "transcription": {
            "enabled": False,
            "provider": "openai",
            "provider_configured": False,
            "model": "whisper-1",
            "language": "",
            "max_duration_sec": 120,
            "max_upload_mb": 25,
            "providers": [],
        },
        "network_safety": {
            "webui_allow_local_service_access": True,
            "webui_default_access_mode": "default",
        },
        "advanced": {
            "restrict_to_workspace": False,
            "ssrf_whitelist_count": 0,
            "webui_allow_local_service_access": True,
            "allow_local_preview_access": True,
            "webui_default_access_mode": "default",
            "private_service_protection_enabled": True,
            "mcp_server_count": len(getattr(config, "mcp_presets", None) or []),
            "exec_enabled": True,
            "exec_sandbox": runtime.normalized_exec_backend(),
            "exec_path_prepend_set": False,
            "exec_path_append_set": False,
        },
        "provider_detail": {
            "name": config.provider,
            "api_base": config.openai_base_url,
            "api_key_masked": masked,
            "has_api_key": bool(key),
        },
        "runtime": {
            "config_path": str(runtime.resolved_config_path()),
            "workspace_path": str(default_workspace()),
            "gateway_host": runtime.host,
            "gateway_port": runtime.port,
            "heartbeat": {
                "enabled": False,
                "interval_s": 0,
                "keep_recent_messages": 0,
            },
            "dream": {"schedule": ""},
            "unified_session": False,
        },
        "usage": {
            "days": [],
            "totals": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "cached_tokens": 0,
                "total_tokens": 0,
                "requests": 0,
            },
        },
        "version": {"current": "minibot"},
    }
