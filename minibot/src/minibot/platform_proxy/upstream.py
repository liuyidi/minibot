"""Resolve platform model id / upstream model → slot runtime for proxy."""

from __future__ import annotations

from typing import Any

from minibot.config.platform_models import (
    PLATFORM_MODELS,
    PlatformRuntime,
    find_platform_model,
    resolve_platform_runtime,
)


def resolve_upstream_runtime(model: str) -> PlatformRuntime | None:
    """Map request ``model`` (platform id or upstream model name) to a runtime."""
    raw = (model or "").strip()
    if not raw:
        return None
    by_id = resolve_platform_runtime(raw)
    if by_id is not None:
        return by_id
    for item in PLATFORM_MODELS:
        runtime = resolve_platform_runtime(item.id)
        if runtime is None:
            continue
        if runtime.model == raw or item.default_model == raw:
            return runtime
    # Last resort: catalog id without env (still need key on server).
    item = find_platform_model(raw)
    if item is not None:
        return resolve_platform_runtime(item.id)
    return None


def usage_from_openai_body(data: dict[str, Any] | None) -> tuple[int, int]:
    if not isinstance(data, dict):
        return 0, 0
    usage = data.get("usage")
    if not isinstance(usage, dict):
        return 0, 0
    prompt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    completion = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    return max(0, prompt), max(0, completion)
