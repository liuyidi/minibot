"""Named OpenAI-compat model presets (Phase 6a MVP)."""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

_SLUG_RE = re.compile(r"[^a-z0-9]+")


class ModelPreset(BaseModel):
    id: str
    label: str = ""
    model: str = "gpt-4o-mini"
    api_key: str = ""
    api_base: str = "https://api.openai.com/v1"
    temperature: float | None = None


class PresetError(ValueError):
    """User-facing preset validation / state error."""


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) > 8:
        return f"{key[:4]}…{key[-4:]}"
    return "****"


def slugify(value: str, *, fallback: str = "preset") -> str:
    text = (value or "").strip().lower()
    text = _SLUG_RE.sub("-", text).strip("-")
    return text or fallback


def ensure_presets(config: Any) -> Any:
    """If no presets, seed ``default`` from live fields. Returns mutated config-like object."""
    presets = list(getattr(config, "model_presets", None) or [])
    if not presets:
        preset = ModelPreset(
            id="default",
            label="Default",
            model=getattr(config, "model", "gpt-4o-mini") or "gpt-4o-mini",
            api_key=getattr(config, "openai_api_key", "") or "",
            api_base=getattr(config, "openai_base_url", "") or "https://api.openai.com/v1",
            temperature=getattr(config, "temperature", None),
        )
        config.model_presets = [preset]
        config.active_preset = "default"
        return config

    # Normalize ids / drop empties
    cleaned: list[ModelPreset] = []
    seen: set[str] = set()
    for raw in presets:
        preset = raw if isinstance(raw, ModelPreset) else ModelPreset.model_validate(raw)
        pid = slugify(preset.id or preset.label or "preset")
        if pid in seen:
            n = 2
            while f"{pid}-{n}" in seen:
                n += 1
            pid = f"{pid}-{n}"
        seen.add(pid)
        if not preset.label:
            preset = preset.model_copy(update={"label": pid})
        cleaned.append(preset.model_copy(update={"id": pid}))
    config.model_presets = cleaned

    active = (getattr(config, "active_preset", None) or "").strip()
    ids = {p.id for p in cleaned}
    if active not in ids:
        config.active_preset = cleaned[0].id
    return config


def find_preset(config: Any, preset_id: str) -> ModelPreset | None:
    ensure_presets(config)
    for preset in config.model_presets:
        if preset.id == preset_id:
            return preset
    return None


def apply_live_to_active_preset(config: Any) -> Any:
    """Write top-level live fields back into the active preset entry."""
    ensure_presets(config)
    active = find_preset(config, config.active_preset)
    if active is None:
        return config
    updated = active.model_copy(
        update={
            "model": config.model,
            "api_key": config.openai_api_key,
            "api_base": config.openai_base_url,
            "temperature": config.temperature,
        }
    )
    config.model_presets = [
        updated if p.id == updated.id else p for p in config.model_presets
    ]
    return config


def activate_preset(config: Any, preset_id: str) -> Any:
    """Copy preset onto live fields. Raises PresetError on validation failure."""
    ensure_presets(config)
    preset = find_preset(config, preset_id)
    if preset is None:
        raise PresetError(f"unknown preset: {preset_id}")
    api_base = (preset.api_base or "").strip()
    api_key = (preset.api_key or "").strip()
    if not api_base:
        raise PresetError("preset api_base is required")
    if not api_key:
        raise PresetError("preset api_key is required")
    config.model = (preset.model or "").strip() or config.model
    config.openai_api_key = api_key
    config.openai_base_url = api_base
    if preset.temperature is not None:
        config.temperature = float(preset.temperature)
    config.active_preset = preset.id
    config.provider = "openai"
    return config


def upsert_preset(
    config: Any,
    *,
    preset_id: str | None = None,
    label: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    api_base: str | None = None,
    temperature: float | None = None,
    activate: bool = False,
) -> ModelPreset:
    """Create or update a preset. Empty api_key means keep existing key."""
    ensure_presets(config)
    pid = slugify(preset_id or label or "preset")
    existing = find_preset(config, pid)
    if existing is None and preset_id:
        # allow explicit new id even if label differs
        existing = next((p for p in config.model_presets if p.id == preset_id), None)
        if existing is not None:
            pid = existing.id

    if existing is None:
        if not (api_base or "").strip():
            raise PresetError("api_base is required for new presets")
        if not (api_key or "").strip():
            raise PresetError("api_key is required for new presets")
        if not (model or "").strip():
            raise PresetError("model is required for new presets")
        preset = ModelPreset(
            id=pid,
            label=(label or pid).strip() or pid,
            model=model.strip(),
            api_key=api_key.strip(),
            api_base=api_base.strip(),
            temperature=temperature,
        )
        # ensure unique id
        ids = {p.id for p in config.model_presets}
        if preset.id in ids:
            n = 2
            while f"{preset.id}-{n}" in ids:
                n += 1
            preset = preset.model_copy(update={"id": f"{preset.id}-{n}"})
        config.model_presets = [*config.model_presets, preset]
    else:
        updates: dict[str, Any] = {}
        if label is not None and label.strip():
            updates["label"] = label.strip()
        if model is not None and model.strip():
            updates["model"] = model.strip()
        if api_base is not None and api_base.strip():
            updates["api_base"] = api_base.strip()
        if temperature is not None:
            updates["temperature"] = temperature
        if api_key is not None and api_key.strip():
            updates["api_key"] = api_key.strip()
        # empty api_key string → keep
        preset = existing.model_copy(update=updates)
        config.model_presets = [
            preset if p.id == existing.id else p for p in config.model_presets
        ]

    if activate:
        activate_preset(config, preset.id)
    return find_preset(config, preset.id)  # type: ignore[return-value]


def delete_preset(config: Any, preset_id: str) -> Any:
    ensure_presets(config)
    if len(config.model_presets) <= 1:
        raise PresetError("cannot delete the last preset")
    if find_preset(config, preset_id) is None:
        raise PresetError(f"unknown preset: {preset_id}")
    remaining = [p for p in config.model_presets if p.id != preset_id]
    config.model_presets = remaining
    if config.active_preset == preset_id:
        activate_preset(config, remaining[0].id)
    return config


def presets_public_list(config: Any) -> list[dict[str, Any]]:
    ensure_presets(config)
    active = config.active_preset
    out: list[dict[str, Any]] = []
    for p in config.model_presets:
        out.append(
            {
                "id": p.id,
                "name": p.id,
                "label": p.label or p.id,
                "active": p.id == active,
                "is_default": p.id == "default",
                "model": p.model,
                "provider": "openai",
                "api_base": p.api_base,
                "api_key_masked": mask_key(p.api_key),
                "has_api_key": bool(p.api_key),
                "temperature": p.temperature if p.temperature is not None else config.temperature,
            }
        )
    return out


def active_preset_summary(config: Any) -> dict[str, Any]:
    ensure_presets(config)
    preset = find_preset(config, config.active_preset)
    return {
        "active_preset": config.active_preset,
        "label": (preset.label if preset else "") or config.active_preset,
        "model": config.model,
        "api_base": config.openai_base_url,
        "api_key_masked": mask_key(config.openai_api_key),
        "has_api_key": bool(config.openai_api_key),
        "implementation": "openai_compat",
        "provider": config.provider,
    }
