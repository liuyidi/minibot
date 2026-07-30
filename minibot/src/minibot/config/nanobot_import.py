"""One-shot import from ~/.nanobot/config.json (Phase 6.4)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from minibot.config.presets import ModelPreset, ensure_presets, slugify
from minibot.providers.registry import find_by_name


def default_nanobot_config_path() -> Path:
    return Path.home() / ".nanobot" / "config.json"


def detect_nanobot_config(path: Path | None = None) -> dict[str, Any]:
    cfg_path = path or default_nanobot_config_path()
    exists = cfg_path.is_file()
    return {
        "path": str(cfg_path),
        "exists": exists,
        "importable": exists,
    }


def _read_nanobot(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("nanobot config root must be an object")
    return data


def _provider_entries(data: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    providers = data.get("providers")
    if not isinstance(providers, dict):
        return []
    out: list[tuple[str, dict[str, Any]]] = []
    for name, raw in providers.items():
        if not isinstance(raw, dict):
            continue
        key = (
            raw.get("apiKey")
            or raw.get("api_key")
            or raw.get("api-key")
            or ""
        )
        base = raw.get("apiBase") or raw.get("api_base") or raw.get("baseUrl") or ""
        if not (key or base):
            continue
        out.append((str(name), {"api_key": str(key or ""), "api_base": str(base or "")}))
    return out


def preview_nanobot_import(path: Path | None = None) -> dict[str, Any]:
    cfg_path = path or default_nanobot_config_path()
    if not cfg_path.is_file():
        return {"ok": False, "error": "nanobot config not found", "path": str(cfg_path)}
    try:
        data = _read_nanobot(cfg_path)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        return {"ok": False, "error": str(exc), "path": str(cfg_path)}

    agents = data.get("agents") if isinstance(data.get("agents"), dict) else {}
    defaults = agents.get("defaults") if isinstance(agents.get("defaults"), dict) else {}
    entries = _provider_entries(data)
    presets_in = data.get("modelPresets") or data.get("model_presets") or {}
    preset_count = len(presets_in) if isinstance(presets_in, dict) else 0
    return {
        "ok": True,
        "path": str(cfg_path),
        "default_model": defaults.get("model") or defaults.get("modelName") or "",
        "provider_keys_found": [name for name, _ in entries],
        "model_preset_count": preset_count,
        "will_create_presets": max(len(entries), 1 if defaults.get("model") else 0),
    }


def import_nanobot_into_config(
    config: Any,
    *,
    path: Path | None = None,
    activate_first: bool = True,
) -> dict[str, Any]:
    """Merge nanobot providers into minibot model_presets (non-destructive upsert by id)."""
    cfg_path = path or default_nanobot_config_path()
    if not cfg_path.is_file():
        raise FileNotFoundError(f"nanobot config not found: {cfg_path}")
    data = _read_nanobot(cfg_path)
    ensure_presets(config)

    agents = data.get("agents") if isinstance(data.get("agents"), dict) else {}
    defaults = agents.get("defaults") if isinstance(agents.get("defaults"), dict) else {}
    default_model = str(defaults.get("model") or defaults.get("modelName") or "gpt-4o-mini")

    created: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []

    existing_ids = {p.id for p in config.model_presets}
    existing_by_provider = {p.provider: p for p in config.model_presets}

    for name, fields in _provider_entries(data):
        spec = find_by_name(name)
        if spec is None:
            # Treat unknown nanobot providers as custom openai_compat
            provider_name = "custom"
            backend_ok = True
        else:
            provider_name = spec.name
            backend_ok = spec.implemented
        if not backend_ok:
            skipped.append(name)
            continue

        pid = slugify(f"nanobot-{name}")
        api_base = fields["api_base"] or (spec.default_api_base if spec else "") or ""
        api_key = fields["api_key"]
        model = default_model
        if name == "anthropic" and not model.startswith("claude"):
            model = "claude-sonnet-4-20250514"

        preset = ModelPreset(
            id=pid,
            label=f"nanobot:{name}",
            model=model,
            provider=provider_name,
            api_key=api_key,
            api_base=api_base or "https://api.openai.com/v1",
        )
        if pid in existing_ids:
            config.model_presets = [
                preset if p.id == pid else p for p in config.model_presets
            ]
            updated.append(pid)
        elif provider_name in existing_by_provider and existing_by_provider[provider_name].api_key:
            skipped.append(f"{name}(already-have-{provider_name})")
        else:
            config.model_presets = [*config.model_presets, preset]
            existing_ids.add(pid)
            created.append(pid)

    # Also pull named modelPresets if present
    presets_in = data.get("modelPresets") or data.get("model_presets") or {}
    if isinstance(presets_in, dict):
        for pname, raw in presets_in.items():
            if not isinstance(raw, dict):
                continue
            pid = slugify(f"nanobot-preset-{pname}")
            if pid in existing_ids:
                continue
            model = str(raw.get("model") or default_model)
            provider = str(raw.get("provider") or "openai")
            if find_by_name(provider) is None:
                provider = "custom"
            api_key = str(raw.get("apiKey") or raw.get("api_key") or "")
            api_base = str(raw.get("apiBase") or raw.get("api_base") or "")
            if not api_key and not api_base:
                continue
            config.model_presets = [
                *config.model_presets,
                ModelPreset(
                    id=pid,
                    label=f"nanobot:{pname}",
                    model=model,
                    provider=provider,
                    api_key=api_key,
                    api_base=api_base or "https://api.openai.com/v1",
                ),
            ]
            existing_ids.add(pid)
            created.append(pid)

    ensure_presets(config)
    activated = None
    if activate_first and created:
        from minibot.config.presets import activate_preset

        try:
            activate_preset(config, created[0])
            activated = created[0]
        except Exception:
            activated = None

    return {
        "ok": True,
        "path": str(cfg_path),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "activated": activated,
        "preset_count": len(config.model_presets),
    }
