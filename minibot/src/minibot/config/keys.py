"""Resolve LLM API keys: user BYOK first, then platform env (Approach A).

Platform keys live only in process environment / deploy secrets and must never
be written into ``config.json``.
"""

from __future__ import annotations

import os
from typing import Literal

from minibot.providers.registry import find_by_name

ConfiguredVia = Literal["user", "platform", "both"]


def platform_env_key(provider: str) -> str:
    """Return the operator-funded key for ``provider``, or empty string."""
    name = (provider or "").strip().lower()
    if not name or name == "auto":
        return ""

    prefixed = os.environ.get(f"MINIBOT_SERVER_{name.upper()}_API_KEY", "").strip()
    if prefixed:
        return prefixed

    spec = find_by_name(name)
    if spec is not None and spec.env_key:
        legacy = (os.environ.get(spec.env_key) or "").strip()
        if legacy:
            return legacy

    # Demo hosts often fund all OpenAI-compat providers with one OPENAI key.
    if spec is not None and spec.backend == "openai_compat" and name != "openai":
        shared = (
            os.environ.get("MINIBOT_SERVER_OPENAI_API_KEY", "").strip()
            or os.environ.get("OPENAI_API_KEY", "").strip()
        )
        if shared:
            return shared
    return ""


def resolve_api_key(provider: str, *, user_key: str = "") -> str:
    """User BYOK wins; otherwise platform env for the concrete provider."""
    user = (user_key or "").strip()
    if user:
        return user
    return platform_env_key(provider)


def configured_via(provider: str, *, user_key: str = "") -> ConfiguredVia | None:
    """How a provider is credentialed for settings UI (never exposes secrets)."""
    has_user = bool((user_key or "").strip())
    has_platform = bool(platform_env_key(provider))
    if has_user and has_platform:
        return "both"
    if has_user:
        return "user"
    if has_platform:
        return "platform"
    return None
