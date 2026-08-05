"""Runtime settings for the FastAPI server."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MINIBOT_SERVER_",
        env_file=".env",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8766
    auth_secret: str = ""
    token_ttl_s: int = 86_400
    require_auth: bool = False

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"
    max_iterations: int = 8
    temperature: float = 0.2

    data_dir: Path = Path.home() / ".minibot"
    config_path: Path | None = None

    # mini-langfuse (optional; soft-import — see observability/langfuse.py)
    langfuse_enabled: bool = False
    langfuse_host: str = "http://localhost:8000"
    langfuse_public_key: str = "pk-lf-demo"
    langfuse_secret_key: str = "sk-lf-demo"

    # minikb (optional; enables kb_list / kb_search / kb_answer when base_url set)
    minikb_base_url: str = ""
    minikb_api_key: str = ""
    minikb_timeout_s: float = 30.0
    minikb_ui_url: str = ""

    # Daily LLM budget (UTC day). 0 = unlimited for that dimension.
    daily_token_limit: int = 0
    daily_turn_limit: int = 0

    def resolved_config_path(self) -> Path:
        if self.config_path is not None:
            return self.config_path.expanduser()
        return self.data_dir.expanduser() / "config.json"

    def resolved_api_key(self) -> str:
        if self.openai_api_key.strip():
            return self.openai_api_key.strip()
        import os

        return (os.environ.get("OPENAI_API_KEY") or "").strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()
