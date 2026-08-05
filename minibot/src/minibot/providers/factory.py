"""Build an LLMProvider from config / registry (Phase 6 / 6.5)."""

from __future__ import annotations

from typing import Any

from minibot.providers.anthropic import AnthropicProvider
from minibot.providers.base import LLMProvider
from minibot.providers.fallback import FallbackProvider, FallbackStats, ProviderSlot
from minibot.providers.openai_compat import OpenAICompatProvider
from minibot.providers.registry import ProviderSpec, find_by_name, resolve_spec


class ProviderError(ValueError):
    """User-facing provider selection / construction error."""


def build_provider(
    *,
    provider: str | None = None,
    model: str | None = None,
    api_key: str = "",
    api_base: str = "",
) -> LLMProvider:
    """Construct the concrete provider for the active settings."""
    spec = resolve_spec(provider=provider, model=model, api_base=api_base)
    return build_from_spec(spec, api_key=api_key, api_base=api_base)


def build_from_spec(
    spec: ProviderSpec,
    *,
    api_key: str = "",
    api_base: str = "",
) -> LLMProvider:
    if not spec.implemented:
        raise ProviderError(
            f"provider {spec.name!r} ({spec.backend}) is not implemented yet"
            + (f": {spec.notes}" if spec.notes else "")
        )

    key = (api_key or "").strip()
    base = (api_base or "").strip() or spec.default_api_base

    if spec.backend == "anthropic":
        return AnthropicProvider(api_key=key, base_url=base or "https://api.anthropic.com")

    if spec.backend == "openai_compat":
        return OpenAICompatProvider(
            api_key=key,
            base_url=base or "https://api.openai.com/v1",
        )

    raise ProviderError(f"unknown backend {spec.backend!r} for provider {spec.name!r}")


def build_provider_chain(
    config: Any,
    *,
    stats: FallbackStats | None = None,
    on_switch: Any | None = None,
    fault: Any | None = None,
) -> LLMProvider:
    """Build primary provider, wrapping FallbackProvider when preset.fallback is set.

    When ``fault`` (FaultController) is provided, the primary slot is wrapped with
    ``FaultInjectingProvider`` so Dev UI can arm soft_error / 429 / 5xx / timeout.
    """
    from minibot.config.keys import resolve_api_key
    from minibot.config.platform_models import (
        first_available_platform_runtime,
        resolve_platform_runtime,
    )
    from minibot.config.presets import ensure_presets, find_preset
    from minibot.providers.fault_inject import FaultInjectingProvider

    ensure_presets(config)
    active = find_preset(config, config.active_preset)
    primary_id = (active.id if active else config.active_preset) or "default"
    primary_label = (active.label if active else "") or primary_id
    primary_provider_name = config.provider or "openai"
    primary_model = config.model
    primary_key = resolve_api_key(
        primary_provider_name,
        user_key=getattr(config, "openai_api_key", None) or "",
    )
    primary_base = config.openai_base_url or ""

    platform_id = (getattr(config, "active_platform_model", None) or "").strip()
    if platform_id:
        runtime = resolve_platform_runtime(platform_id)
        if runtime is not None and runtime.available:
            primary_id = runtime.id
            primary_label = runtime.label
            primary_provider_name = runtime.provider
            primary_model = runtime.model
            primary_key = runtime.api_key
            primary_base = runtime.api_base
    elif (primary_provider_name or "").strip() == "auto":
        runtime = first_available_platform_runtime()
        if runtime is not None:
            primary_id = runtime.id
            primary_label = runtime.label
            primary_provider_name = runtime.provider
            primary_model = runtime.model
            primary_key = runtime.api_key
            primary_base = runtime.api_base

    primary_impl = build_provider(
        provider=primary_provider_name,
        model=primary_model,
        api_key=primary_key,
        api_base=primary_base,
    )
    if fault is not None:
        primary_impl = FaultInjectingProvider(primary_impl, fault)
    spec = resolve_spec(provider=primary_provider_name, model=primary_model, api_base=primary_base)
    slots: list[ProviderSlot] = [
        ProviderSlot(
            id=primary_id,
            label=primary_label,
            provider_name=spec.name,
            model=primary_model,
            backend=spec.backend,
            provider=primary_impl,
        )
    ]

    fallback_ids = list(getattr(active, "fallback", None) or []) if active else []
    seen = {primary_id}
    for fid in fallback_ids:
        fid = (fid or "").strip()
        if not fid or fid in seen:
            continue
        preset = find_preset(config, fid)
        if preset is None:
            continue
        pspec = find_by_name(preset.provider) or resolve_spec(
            provider=preset.provider, model=preset.model, api_base=preset.api_base
        )
        if not pspec.implemented:
            continue
        try:
            impl = build_provider(
                provider=preset.provider,
                model=preset.model,
                api_key=resolve_api_key(preset.provider, user_key=preset.api_key or ""),
                api_base=preset.api_base,
            )
        except ProviderError:
            continue
        slots.append(
            ProviderSlot(
                id=preset.id,
                label=preset.label or preset.id,
                provider_name=pspec.name,
                model=preset.model,
                backend=pspec.backend,
                provider=impl,
            )
        )
        seen.add(preset.id)

    if len(slots) == 1:
        return slots[0].provider
    return FallbackProvider(slots, on_switch=on_switch, stats=stats or FallbackStats())


def provider_runtime_summary(
    *,
    provider: str | None,
    model: str | None,
    api_key: str,
    api_base: str,
) -> dict[str, Any]:
    """Masked summary for Dev UI / settings."""
    from minibot.config.presets import mask_key

    spec = resolve_spec(provider=provider, model=model, api_base=api_base)
    return {
        "provider": spec.name,
        "label": spec.display_name,
        "backend": spec.backend,
        "implemented": spec.implemented,
        "model": model or "",
        "api_base": (api_base or "").strip() or spec.default_api_base,
        "api_key_masked": mask_key(api_key),
        "has_api_key": bool((api_key or "").strip()),
        "implementation": spec.backend,
    }
