"""Shared httpx options for outbound LLM / tool HTTP calls."""

from __future__ import annotations

import os


def _env_flag(name: str) -> str:
    return (os.environ.get(name) or "").strip().lower()


def _socksio_available() -> bool:
    try:
        import socksio  # noqa: F401

        return True
    except ImportError:
        return False


def _env_has_socks_proxy() -> bool:
    for key in ("ALL_PROXY", "all_proxy", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        value = (os.environ.get(key) or "").strip().lower()
        if value.startswith("socks"):
            return True
    return False


def outbound_httpx_trust_env() -> bool:
    """Whether outbound httpx clients should honor HTTP(S)_PROXY / ALL_PROXY.

    Applies to LLM providers and tools like ``web_search`` / ``web_fetch``.

    - ``MINIBOT_HTTP_IGNORE_PROXY=1`` (or legacy ``MINIBOT_LLM_IGNORE_PROXY=1``)
      → never trust env proxies
    - ``…=0`` → always trust env proxies
    - unset → trust env, except auto-bypass when a SOCKS proxy is configured
      but ``socksio`` is not installed (common local Clash setup)
    """
    for name in ("MINIBOT_HTTP_IGNORE_PROXY", "MINIBOT_LLM_IGNORE_PROXY"):
        raw = _env_flag(name)
        if raw in {"1", "true", "yes", "on"}:
            return False
        if raw in {"0", "false", "no", "off"}:
            return True
    if _env_has_socks_proxy() and not _socksio_available():
        return False
    return True


def llm_httpx_trust_env() -> bool:
    """Alias for :func:`outbound_httpx_trust_env` (LLM providers)."""
    return outbound_httpx_trust_env()
