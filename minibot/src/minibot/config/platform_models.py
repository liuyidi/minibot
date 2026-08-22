"""Read-only platform builtin model catalog (operator-funded keys via env).

Env convention per slot (see ``minibot/.env.models.example``)::

    MINIBOT_SERVER_{SLOT}_API_KEY=
    MINIBOT_SERVER_{SLOT}_BASE_URL=
    MINIBOT_SERVER_{SLOT}_MODEL=

Example slots: ``openai``, ``deepseek_pro``, ``qwen``, ``glm``, ``kimi``,
``minimax``, ``doubao``.

Local / deploy layout (recommended)::

    .env.runtime   # Langfuse / E2B / minikb / budget (non-model)
    .env.models    # platform slot keys (gitignored)
    .env           # merge of the two — ``scripts/merge-env.sh``

``platform_models`` also reads ``.env.models`` directly so slots work even
before merge; Settings still loads the merged ``.env``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

BackendName = Literal["openai_compat", "anthropic"]


@dataclass(frozen=True)
class PlatformModel:
    id: str
    label: str
    slot: str
    default_model: str
    default_api_base: str = ""
    brand: str = "custom"  # UI / Auto branding hint
    backend: BackendName = "openai_compat"
    context_window_tokens: int = 128_000


@dataclass(frozen=True)
class PlatformRuntime:
    id: str
    label: str
    slot: str
    brand: str
    backend: BackendName
    model: str
    api_base: str
    api_key: str
    context_window_tokens: int
    available: bool

    @property
    def provider(self) -> str:
        """Registry provider name for ``build_provider``."""
        return "anthropic" if self.backend == "anthropic" else "custom"


# Slot names map to MINIBOT_SERVER_{SLOT}_* env vars (uppercase).
PLATFORM_MODELS: tuple[PlatformModel, ...] = (
    PlatformModel(
        id="platform-deepseek-v4-flash",
        label="DeepSeek V4 Flash",
        slot="openai",  # legacy shared OpenAI-compat slot in .env
        default_model="deepseek-v4-flash",
        default_api_base="https://api.deepseek.com/v1",
        brand="deepseek",
    ),
    PlatformModel(
        id="platform-deepseek-v4-pro",
        label="DeepSeek V4 Pro",
        slot="deepseek_pro",
        default_model="deepseek-v4-pro",
        default_api_base="https://api.deepseek.com/v1",
        brand="deepseek",
    ),
    PlatformModel(
        id="platform-qwen3.7-plus",
        label="Qwen 3.7 Plus",
        slot="qwen",
        default_model="qwen3.7-plus",
        default_api_base="",
        brand="qwen",
    ),
    PlatformModel(
        id="platform-glm-5.2",
        label="GLM 5.2",
        slot="glm",
        default_model="glm-5.2",
        default_api_base="",
        brand="glm",
    ),
    PlatformModel(
        id="platform-kimi-k2.7-code",
        label="Kimi K2.7 Code",
        slot="kimi",
        default_model="kimi-k2.7-code",
        default_api_base="",
        brand="kimi",
    ),
    PlatformModel(
        id="platform-minimax-m3",
        label="MiniMax M3",
        slot="minimax",
        default_model="minimax-m3",
        default_api_base="",
        brand="minimax",
    ),
    PlatformModel(
        id="platform-doubao-seed-2.0-lite",
        label="Doubao Seed 2.0 Lite",
        slot="doubao",
        default_model="doubao-seed-2.0-lite",
        default_api_base="https://ark.cn-beijing.volces.com/api/coding",
        brand="doubao",
        backend="anthropic",
    ),
)

_BY_ID = {m.id: m for m in PLATFORM_MODELS}


def find_platform_model(model_id: str) -> PlatformModel | None:
    return _BY_ID.get((model_id or "").strip())


def _project_root() -> Path:
    # platform_models.py -> config -> package -> src -> project root (minibot/)
    return Path(__file__).resolve().parents[3]


def _dotenv_candidate_paths() -> list[Path]:
    """Ordered env files: later entries override earlier ones."""
    root = _project_root()
    cwd = Path.cwd()
    data_dir = (os.environ.get("MINIBOT_SERVER_DATA_DIR") or "").strip()
    paths: list[Path] = [
        cwd / ".env.runtime",
        root / ".env.runtime",
        cwd / ".env.models",
        root / ".env.models",
        cwd / ".env",
        root / ".env",
    ]
    if data_dir:
        base = Path(data_dir).expanduser()
        paths.extend(
            [
                base / ".env.models",
                base / ".env",
            ]
        )
    return paths


@lru_cache(maxsize=1)
def _dotenv_map() -> dict[str, str]:
    """Load dotenv files (pydantic Settings only imports declared fields)."""
    try:
        from dotenv import dotenv_values
    except ImportError:
        return {}
    merged: dict[str, str] = {}
    for path in _dotenv_candidate_paths():
        if not path.is_file():
            continue
        for key, value in dotenv_values(path).items():
            if key and value is not None and str(value).strip():
                merged[str(key)] = str(value).strip()
    return merged


def clear_platform_env_cache() -> None:
    """Test helper: reload dotenv after monkeypatching."""
    clear = getattr(_dotenv_map, "cache_clear", None)
    if callable(clear):
        clear()


def _env_get(name: str) -> str:
    direct = (os.environ.get(name) or "").strip()
    if direct:
        return direct
    return (_dotenv_map().get(name) or "").strip()


def _slot_env(slot: str, suffix: str) -> str:
    key = f"MINIBOT_SERVER_{slot.strip().upper()}_{suffix}"
    return _env_get(key)


def platform_slot_api_key(slot: str) -> str:
    return _slot_env(slot, "API_KEY")


def platform_slot_base_url(slot: str, *, default: str = "") -> str:
    return _slot_env(slot, "BASE_URL") or (default or "").strip()


def platform_slot_model(slot: str, *, default: str = "") -> str:
    explicit = _slot_env(slot, "MODEL")
    if explicit:
        return explicit
    # Backward compat: first OpenAI-compat block used global MINIBOT_SERVER_MODEL.
    if slot.strip().lower() == "openai":
        global_model = _env_get("MINIBOT_SERVER_MODEL")
        if global_model:
            return global_model
    return (default or "").strip()


def resolve_platform_runtime(model_id: str) -> PlatformRuntime | None:
    item = find_platform_model(model_id)
    if item is None:
        return None
    api_key = platform_slot_api_key(item.slot)
    api_base = platform_slot_base_url(item.slot, default=item.default_api_base)
    model = platform_slot_model(item.slot, default=item.default_model)
    return PlatformRuntime(
        id=item.id,
        label=item.label,
        slot=item.slot,
        brand=item.brand,
        backend=item.backend,
        model=model or item.default_model,
        api_base=api_base,
        api_key=api_key,
        context_window_tokens=item.context_window_tokens,
        available=bool(api_key),
    )


def proxy_chat_base(proxy_base_url: str) -> str:
    return f"{(proxy_base_url or '').rstrip('/')}/platform/v1"


def resolve_platform_runtime_proxied(
    model_id: str,
    *,
    proxy_base_url: str,
    proxy_token: str,
) -> PlatformRuntime | None:
    """Desktop/local: route platform models through cloud ``/platform/v1``."""
    item = find_platform_model(model_id)
    if item is None:
        return None
    token = (proxy_token or "").strip()
    model = platform_slot_model(item.slot, default=item.default_model) or item.default_model
    return PlatformRuntime(
        id=item.id,
        label=item.label,
        slot=item.slot,
        brand=item.brand,
        # Wire format is always OpenAI chat; cloud converts anthropic slots.
        backend="openai_compat",
        model=model,
        api_base=proxy_chat_base(proxy_base_url),
        api_key=token,
        context_window_tokens=item.context_window_tokens,
        available=bool(token),
    )


def platform_models_public(
    *,
    user_key: str = "",
    proxy_base_url: str = "",
    proxy_token: str = "",
) -> list[dict[str, Any]]:
    """Settings payload rows; never include secrets."""
    del user_key  # platform availability is env-slot or proxy-token based, not user BYOK
    proxy = (proxy_base_url or "").strip()
    rows: list[dict[str, Any]] = []
    if proxy:
        available = bool((proxy_token or "").strip())
        base = proxy_chat_base(proxy)
        for item in PLATFORM_MODELS:
            model = platform_slot_model(item.slot, default=item.default_model) or item.default_model
            rows.append(
                {
                    "id": item.id,
                    "label": item.label,
                    "provider": item.brand,
                    "backend": "openai_compat",
                    "slot": item.slot,
                    "model": model,
                    "api_base": base,
                    "source": "platform",
                    "available": available,
                    "context_window_tokens": item.context_window_tokens,
                }
            )
        return rows
    for item in PLATFORM_MODELS:
        runtime = resolve_platform_runtime(item.id)
        assert runtime is not None
        rows.append(
            {
                "id": runtime.id,
                "label": runtime.label,
                "provider": runtime.brand,
                "backend": runtime.backend,
                "slot": runtime.slot,
                "model": runtime.model,
                "api_base": runtime.api_base,
                "source": "platform",
                "available": runtime.available,
                "context_window_tokens": runtime.context_window_tokens,
            }
        )
    return rows


def any_platform_model_available(*, proxy_token: str = "", proxy_base_url: str = "") -> bool:
    if (proxy_base_url or "").strip():
        return bool((proxy_token or "").strip())
    return any(
        (rt := resolve_platform_runtime(m.id)) is not None and rt.available for m in PLATFORM_MODELS
    )


def first_available_platform_runtime(
    *,
    proxy_base_url: str = "",
    proxy_token: str = "",
) -> PlatformRuntime | None:
    proxy = (proxy_base_url or "").strip()
    if proxy:
        for item in PLATFORM_MODELS:
            runtime = resolve_platform_runtime_proxied(
                item.id, proxy_base_url=proxy, proxy_token=proxy_token
            )
            if runtime is not None and runtime.available:
                return runtime
        return None
    for item in PLATFORM_MODELS:
        runtime = resolve_platform_runtime(item.id)
        if runtime is not None and runtime.available:
            return runtime
    return None


def bootstrap_model_selection(
    config: Any,
    *,
    settings: Any | None = None,
    user_root: Path | None = None,
) -> Any:
    """Pick the first available platform model for first-run / empty configs."""
    from minibot.config.settings import get_settings

    settings = settings or get_settings()
    proxy_base = ""
    proxy_token = ""
    from minibot.config.platform_credentials import (
        ensure_platform_token_sync,
        platform_proxy_mode_enabled,
    )

    if platform_proxy_mode_enabled(settings):
        proxy_base = settings.platform_proxy_base_url.strip()
        if user_root is not None:
            try:
                creds = ensure_platform_token_sync(
                    user_root,
                    proxy_base_url=proxy_base,
                    timeout_s=settings.mini_auth_timeout_s,
                )
                proxy_token = creds.access_token
            except Exception:  # noqa: BLE001 — bootstrap must not block startup
                proxy_token = ""

    runtime = first_available_platform_runtime(
        proxy_base_url=proxy_base, proxy_token=proxy_token
    )
    if runtime is None:
        return config
    try:
        apply_platform_model(
            config,
            runtime.id,
            proxy_base_url=proxy_base,
            proxy_token=proxy_token,
        )
    except KeyError:
        return config
    return config


def apply_auto_model(config: Any, *, proxy_base_url: str = "", proxy_token: str = "") -> Any:
    """Select Auto mode and sync live model/base to the first available platform slot."""
    config.provider = "auto"
    config.active_platform_model = ""
    runtime = first_available_platform_runtime(
        proxy_base_url=proxy_base_url, proxy_token=proxy_token
    )
    if runtime is None:
        return config
    config.model = runtime.model
    config.openai_base_url = runtime.api_base or ""
    if hasattr(config, "context_window_tokens"):
        config.context_window_tokens = runtime.context_window_tokens
    return config


def effective_chat_model(
    config: Any, *, proxy_base_url: str = "", proxy_token: str = ""
) -> str:
    """Model id for LLM calls — honor platform / Auto over stale config.model."""
    platform_id = (getattr(config, "active_platform_model", None) or "").strip()
    if platform_id:
        if (proxy_base_url or "").strip():
            runtime = resolve_platform_runtime_proxied(
                platform_id, proxy_base_url=proxy_base_url, proxy_token=proxy_token
            )
        else:
            runtime = resolve_platform_runtime(platform_id)
        if runtime is not None and runtime.available and runtime.model:
            return runtime.model
    if (getattr(config, "provider", "") or "").strip() == "auto":
        runtime = first_available_platform_runtime(
            proxy_base_url=proxy_base_url, proxy_token=proxy_token
        )
        if runtime is not None and runtime.model:
            return runtime.model
    return (getattr(config, "model", None) or "").strip()


def apply_platform_model(
    config: Any,
    model_id: str,
    *,
    proxy_base_url: str = "",
    proxy_token: str = "",
) -> Any:
    """Set live model/provider/base from catalog+env; do not write platform keys."""
    if (proxy_base_url or "").strip():
        runtime = resolve_platform_runtime_proxied(
            model_id, proxy_base_url=proxy_base_url, proxy_token=proxy_token
        )
    else:
        runtime = resolve_platform_runtime(model_id)
    if runtime is None:
        raise KeyError(f"unknown platform model: {model_id}")
    if not runtime.available:
        raise KeyError(f"platform model unavailable (missing env key): {model_id}")
    config.model = runtime.model
    # Credentials stay in env/proxy token; provider name selects openai_compat vs anthropic.
    config.provider = runtime.provider
    if runtime.api_base:
        config.openai_base_url = runtime.api_base
    if hasattr(config, "context_window_tokens"):
        config.context_window_tokens = runtime.context_window_tokens
    config.active_platform_model = runtime.id
    return config
