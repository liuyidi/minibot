"""Provider registry — metadata for LLM backends (Phase 6).

Inspired by minibot's ProviderSpec and CrewAI's OPENAI_COMPATIBLE_PROVIDERS:
a small table drives factory selection, default bases, and Dev UI listings.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderSpec:
    """One named provider entry."""

    name: str
    display_name: str
    backend: str  # "openai_compat" | "anthropic" | "azure_openai" | "bedrock" | "oauth_stub"
    env_key: str = ""
    default_api_base: str = ""
    keywords: tuple[str, ...] = ()
    is_gateway: bool = False
    is_local: bool = False
    implemented: bool = True
    notes: str = ""


# Order = display / match priority. Keep this list intentionally small.
PROVIDERS: tuple[ProviderSpec, ...] = (
    ProviderSpec(
        name="openai",
        display_name="OpenAI",
        backend="openai_compat",
        env_key="OPENAI_API_KEY",
        default_api_base="https://api.openai.com/v1",
        keywords=("openai", "gpt", "o1", "o3", "o4"),
    ),
    ProviderSpec(
        name="anthropic",
        display_name="Anthropic",
        backend="anthropic",
        env_key="ANTHROPIC_API_KEY",
        default_api_base="https://api.anthropic.com",
        keywords=("anthropic", "claude"),
    ),
    ProviderSpec(
        name="openrouter",
        display_name="OpenRouter",
        backend="openai_compat",
        env_key="OPENROUTER_API_KEY",
        default_api_base="https://openrouter.ai/api/v1",
        keywords=("openrouter",),
        is_gateway=True,
    ),
    ProviderSpec(
        name="deepseek",
        display_name="DeepSeek",
        backend="openai_compat",
        env_key="DEEPSEEK_API_KEY",
        default_api_base="https://api.deepseek.com/v1",
        keywords=("deepseek",),
    ),
    ProviderSpec(
        name="ollama",
        display_name="Ollama",
        backend="openai_compat",
        env_key="OLLAMA_API_KEY",
        default_api_base="http://127.0.0.1:11434/v1",
        keywords=("ollama", "llama", "qwen"),
        is_local=True,
    ),
    ProviderSpec(
        name="custom",
        display_name="Custom (OpenAI-compat)",
        backend="openai_compat",
        default_api_base="",
        notes="Any OpenAI-compatible /chat/completions endpoint",
    ),
    ProviderSpec(
        name="azure_openai",
        display_name="Azure OpenAI",
        backend="azure_openai",
        default_api_base="",
        keywords=("azure",),
        implemented=False,
        notes="Stub — use custom openai_compat with Azure deployment URL for now",
    ),
    ProviderSpec(
        name="bedrock",
        display_name="AWS Bedrock",
        backend="bedrock",
        env_key="AWS_BEARER_TOKEN_BEDROCK",
        keywords=("bedrock",),
        implemented=False,
        notes="Stub — Phase 6 follow-up",
    ),
)

_BY_NAME = {p.name: p for p in PROVIDERS}


def find_by_name(name: str | None) -> ProviderSpec | None:
    if not name:
        return None
    return _BY_NAME.get(name.strip().lower())


def resolve_spec(
    *,
    provider: str | None = None,
    model: str | None = None,
    api_base: str | None = None,
) -> ProviderSpec:
    """Pick a ProviderSpec from explicit name, else model/base heuristics."""
    explicit = find_by_name(provider)
    if explicit is not None:
        return explicit

    base = (api_base or "").lower()
    if "anthropic" in base:
        return _BY_NAME["anthropic"]
    if "openrouter" in base:
        return _BY_NAME["openrouter"]
    if "deepseek" in base:
        return _BY_NAME["deepseek"]
    if "11434" in base or "ollama" in base:
        return _BY_NAME["ollama"]

    model_l = (model or "").lower()
    for spec in PROVIDERS:
        if any(k in model_l for k in spec.keywords):
            return spec

    return _BY_NAME["openai"]


def list_providers(*, include_stubs: bool = True) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    for spec in PROVIDERS:
        if not include_stubs and not spec.implemented:
            continue
        out.append(
            {
                "name": spec.name,
                "label": spec.display_name,
                "backend": spec.backend,
                "implemented": spec.implemented,
                "env_key": spec.env_key,
                "default_api_base": spec.default_api_base,
                "is_gateway": spec.is_gateway,
                "is_local": spec.is_local,
                "notes": spec.notes,
            }
        )
    return out
