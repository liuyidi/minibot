"""Runtime settings for the FastAPI server."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from minibot.security.principal_context import current_data_dir


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MINIBOT_SERVER_",
        env_file=(".env.runtime", ".env.models", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8766
    auth_secret: str = ""
    auth_provider: str = "local"
    token_ttl_s: int = 86_400
    require_auth: bool = False

    mini_auth_base_url: str = "http://127.0.0.1:8000"
    mini_auth_client_id: str = "minibot"
    mini_auth_scope: str = "openid profile email"
    mini_auth_callback_path: str = "/auth/mini-auth/callback"
    mini_auth_timeout_s: float = 20.0

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"
    max_iterations: int = 8
    temperature: float = 0.2

    data_dir: Path = Path.home() / ".minibot"
    config_path: Path | None = None
    legacy_owner_user_id: str = ""

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

    # Exec sandbox: local (cwd/bwrap) or e2b (Firecracker microVM)
    exec_backend: str = "local"
    e2b_api_key: str = ""
    e2b_timeout_s: int = 900
    e2b_idle_s: int = 900

    # Feishu / Lark IM channel (Phase 15 subset)
    feishu_enabled: bool = False
    feishu_app_id: str = ""
    feishu_app_secret: str = ""
    feishu_allow_from: str = "*"  # CSV of open_ids, or "*"
    feishu_domain: str = "feishu"  # feishu | lark
    feishu_group_policy: str = "mention"  # open | mention
    feishu_auto_approve_tools: bool = True

    # WeChat / weixin IM channel (Phase 1)
    weixin_enabled: bool = False
    weixin_token: str = ""
    weixin_allow_from: str = "*"
    weixin_base_url: str = ""
    weixin_poll_timeout: int = 35
    weixin_auto_approve_tools: bool = True

    def resolved_config_path(self) -> Path:
        data_dir = current_data_dir()
        if data_dir is not None:
            return Path(data_dir).expanduser() / "config.json"
        if self.config_path is not None:
            return self.config_path.expanduser()
        return self.data_dir.expanduser() / "config.json"

    def resolved_api_key(self) -> str:
        if self.openai_api_key.strip():
            return self.openai_api_key.strip()
        import os

        return (os.environ.get("OPENAI_API_KEY") or "").strip()

    def resolved_e2b_api_key(self) -> str:
        if self.e2b_api_key.strip():
            return self.e2b_api_key.strip()
        import os

        return (os.environ.get("E2B_API_KEY") or "").strip()

    def normalized_exec_backend(self) -> str:
        value = (self.exec_backend or "local").strip().lower()
        return value if value in {"local", "e2b"} else "local"

    def normalized_auth_provider(self) -> str:
        value = (self.auth_provider or "local").strip().lower().replace("-", "_")
        return value if value in {"local", "mini_auth"} else "local"

    def normalized_legacy_owner_user_id(self) -> str:
        return self.legacy_owner_user_id.strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()
