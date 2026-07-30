"""Named model presets (Phase 6a + Phase 6 provider field)."""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from minibot.providers.registry import find_by_name, resolve_spec

_SLUG_RE = re.compile(r"[^a-z0-9]+")


class ModelPreset(BaseModel):
    id: str
    label: str = ""
    model: str = "gpt-4o-mini"
    provider: str = "openai"
    api_key: str = ""
    api_base: str = "https://api.openai.com/v1"
    temperature: float | None = None
    # Phase 6.5: ordered preset ids to try after this one fails
    fallback: list[str] = Field(default_factory=list)


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


def _default_base_for(provider: str, api_base: str) -> str:
    spec = find_by_name(provider)
    if (api_base or "").strip():
        return api_base.strip()
    if spec and spec.default_api_base:
        return spec.default_api_base
    return "https://api.openai.com/v1"


def ensure_presets(config: Any) -> Any:
    """If no presets, seed ``default`` from live fields. Returns mutated config-like object."""
    presets = list(getattr(config, "model_presets", None) or [])
    if not presets:
        provider = getattr(config, "provider", None) or "openai"
        spec = resolve_spec(
            provider=provider,
            model=getattr(config, "model", None),
            api_base=getattr(config, "openai_base_url", None),
        )
        preset = ModelPreset(
            id="default",
            label="Default",
            model=getattr(config, "model", "gpt-4o-mini") or "gpt-4o-mini",
            provider=spec.name,
            api_key=getattr(config, "openai_api_key", "") or "",
            api_base=getattr(config, "openai_base_url", "") or spec.default_api_base
            or "https://api.openai.com/v1",
            temperature=getattr(config, "temperature", None),
        )
        config.model_presets = [preset]
        config.active_preset = "default"
        config.provider = spec.name
        return config

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
        updates: dict[str, Any] = {"id": pid}
        if not preset.label:
            updates["label"] = pid
        provider = (preset.provider or "").strip()
        if not provider:
            provider = resolve_spec(
                provider=None, model=preset.model, api_base=preset.api_base
            ).name
        updates["provider"] = provider
        if not (preset.api_base or "").strip():
            updates["api_base"] = _default_base_for(provider, "")
        cleaned.append(preset.model_copy(update=updates))
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
            "provider": config.provider or active.provider,
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
    provider = (preset.provider or "openai").strip() or "openai"
    spec = find_by_name(provider)
    if spec is None:
        raise PresetError(f"unknown provider: {provider}")
    if not spec.implemented:
        raise PresetError(
            f"provider {provider!r} is not implemented yet"
            + (f" ({spec.notes})" if spec.notes else "")
        )
    api_base = _default_base_for(provider, preset.api_base or "")
    api_key = (preset.api_key or "").strip()
    # Ollama / local may allow empty key
    if not api_key and not (spec.is_local or provider == "ollama"):
        raise PresetError("preset api_key is required")
    if not api_base and provider != "custom":
        raise PresetError("preset api_base is required")
    config.model = (preset.model or "").strip() or config.model
    config.openai_api_key = api_key
    config.openai_base_url = api_base
    config.provider = provider
    if preset.temperature is not None:
        config.temperature = float(preset.temperature)
    config.active_preset = preset.id
    return config


def upsert_preset(
    config: Any,
    *,
    preset_id: str | None = None,
    label: str | None = None,
    model: str | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    api_base: str | None = None,
    temperature: float | None = None,
    fallback: list[str] | None = None,
    activate: bool = False,
) -> ModelPreset:
    """Create or update a preset. Empty api_key means keep existing key."""
    ensure_presets(config)
    pid = slugify(preset_id or label or "preset")
    existing = find_preset(config, pid)
    if existing is None and preset_id:
        existing = next((p for p in config.model_presets if p.id == preset_id), None)
        if existing is not None:
            pid = existing.id

    if existing is None:
        provider_name = (provider or "openai").strip() or "openai"
        spec = find_by_name(provider_name)
        if spec is None:
            raise PresetError(f"unknown provider: {provider_name}")
        resolved_base = _default_base_for(provider_name, api_base or "")
        if not resolved_base and provider_name != "custom":
            raise PresetError("api_base is required for new presets")
        if not (api_key or "").strip() and not (spec.is_local or provider_name == "ollama"):
            raise PresetError("api_key is required for new presets")
        if not (model or "").strip():
            raise PresetError("model is required for new presets")
        fb = _normalize_fallback(fallback or [], self_id=pid)
        preset = ModelPreset(
            id=pid,
            label=(label or pid).strip() or pid,
            model=model.strip(),
            provider=provider_name,
            api_key=(api_key or "").strip(),
            api_base=resolved_base,
            temperature=temperature,
            fallback=fb,
        )
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
        if provider is not None and provider.strip():
            updates["provider"] = provider.strip()
        if api_base is not None and api_base.strip():
            updates["api_base"] = api_base.strip()
        if temperature is not None:
            updates["temperature"] = temperature
        if api_key is not None and api_key.strip():
            updates["api_key"] = api_key.strip()
        if fallback is not None:
            updates["fallback"] = _normalize_fallback(fallback, self_id=existing.id)
        preset = existing.model_copy(update=updates)
        config.model_presets = [
            preset if p.id == existing.id else p for p in config.model_presets
        ]

    if activate:
        activate_preset(config, preset.id)
    return find_preset(config, preset.id)  # type: ignore[return-value]


def _normalize_fallback(ids: list[str], *, self_id: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = {self_id}
    for raw in ids:
        fid = (raw or "").strip()
        if not fid or fid in seen:
            continue
        seen.add(fid)
        out.append(fid)
    return out


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
        spec = find_by_name(p.provider) or resolve_spec(
            provider=p.provider, model=p.model, api_base=p.api_base
        )
        out.append(
            {
                "id": p.id,
                "name": p.id,
                "label": p.label or p.id,
                "active": p.id == active,
                "is_default": p.id == "default",
                "model": p.model,
                "provider": p.provider or spec.name,
                "backend": spec.backend,
                "api_base": p.api_base,
                "api_key_masked": mask_key(p.api_key),
                "has_api_key": bool(p.api_key),
                "temperature": p.temperature if p.temperature is not None else config.temperature,
                "fallback": list(p.fallback or []),
            }
        )
    return out


def active_preset_summary(config: Any) -> dict[str, Any]:
    ensure_presets(config)
    preset = find_preset(config, config.active_preset)
    from minibot.providers.factory import provider_runtime_summary

    summary = provider_runtime_summary(
        provider=config.provider,
        model=config.model,
        api_key=config.openai_api_key,
        api_base=config.openai_base_url,
    )
    return {
        "active_preset": config.active_preset,
        "label": (preset.label if preset else "") or config.active_preset,
        "fallback": list(preset.fallback) if preset else [],
        **summary,
    }
