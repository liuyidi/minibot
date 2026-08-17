"""Local desktop credentials for cloud platform proxy (no vendor keys)."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger("minibot.platform_credentials")

CREDENTIALS_NAME = "platform_credentials.json"


@dataclass
class PlatformCredentials:
    mini_auth_access_token: str = ""
    access_token: str = ""
    expires_at: float = 0.0

    @property
    def platform_token_valid(self) -> bool:
        token = (self.access_token or "").strip()
        if not token:
            return False
        # Refresh 60s early.
        return float(self.expires_at or 0) > time.time() + 60


def credentials_path(user_data_dir: Path) -> Path:
    return Path(user_data_dir).expanduser() / CREDENTIALS_NAME


def load_platform_credentials(user_data_dir: Path) -> PlatformCredentials | None:
    path = credentials_path(user_data_dir)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    return PlatformCredentials(
        mini_auth_access_token=str(raw.get("mini_auth_access_token") or ""),
        access_token=str(raw.get("access_token") or ""),
        expires_at=float(raw.get("expires_at") or 0),
    )


def save_platform_credentials(user_data_dir: Path, creds: PlatformCredentials) -> None:
    path = credentials_path(user_data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "mini_auth_access_token": creds.mini_auth_access_token,
        "access_token": creds.access_token,
        "expires_at": creds.expires_at,
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)
    try:
        path.chmod(0o600)
    except OSError:
        pass


def clear_platform_credentials(user_data_dir: Path) -> None:
    path = credentials_path(user_data_dir)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


async def exchange_platform_token(
    *,
    proxy_base_url: str,
    mini_auth_access_token: str,
    timeout_s: float = 20.0,
) -> PlatformCredentials:
    base = (proxy_base_url or "").rstrip("/")
    mini = (mini_auth_access_token or "").strip()
    if not base or not mini:
        raise ValueError("proxy_base_url and mini_auth_access_token required")
    url = f"{base}/platform/v1/token"
    async with httpx.AsyncClient(timeout=timeout_s, trust_env=False) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {mini}"},
        )
        response.raise_for_status()
        data = response.json()
    return _credentials_from_token_response(mini, data)


def exchange_platform_token_sync(
    *,
    proxy_base_url: str,
    mini_auth_access_token: str,
    timeout_s: float = 20.0,
) -> PlatformCredentials:
    base = (proxy_base_url or "").rstrip("/")
    mini = (mini_auth_access_token or "").strip()
    if not base or not mini:
        raise ValueError("proxy_base_url and mini_auth_access_token required")
    url = f"{base}/platform/v1/token"
    with httpx.Client(timeout=timeout_s, trust_env=False) as client:
        response = client.post(
            url,
            headers={"Authorization": f"Bearer {mini}"},
        )
        response.raise_for_status()
        data = response.json()
    return _credentials_from_token_response(mini, data)


def _credentials_from_token_response(mini: str, data: Any) -> PlatformCredentials:
    if not isinstance(data, dict) or not data.get("access_token"):
        raise ValueError("platform token response missing access_token")
    expires_in = int(data.get("expires_in") or 3600)
    return PlatformCredentials(
        mini_auth_access_token=mini,
        access_token=str(data["access_token"]),
        expires_at=time.time() + max(60, expires_in),
    )


async def ensure_platform_token(
    user_data_dir: Path,
    *,
    proxy_base_url: str,
    mini_auth_access_token: str | None = None,
    timeout_s: float = 20.0,
) -> PlatformCredentials:
    """Return a valid platform token, exchanging/refreshing as needed."""
    existing = load_platform_credentials(user_data_dir)
    if existing is not None and existing.platform_token_valid:
        return existing
    mini = (mini_auth_access_token or (existing.mini_auth_access_token if existing else "")).strip()
    if not mini:
        raise ValueError("mini_auth_access_token required to exchange platform token")
    creds = await exchange_platform_token(
        proxy_base_url=proxy_base_url,
        mini_auth_access_token=mini,
        timeout_s=timeout_s,
    )
    save_platform_credentials(user_data_dir, creds)
    return creds


def ensure_platform_token_sync(
    user_data_dir: Path,
    *,
    proxy_base_url: str,
    mini_auth_access_token: str | None = None,
    timeout_s: float = 20.0,
) -> PlatformCredentials:
    existing = load_platform_credentials(user_data_dir)
    if existing is not None and existing.platform_token_valid:
        return existing
    mini = (mini_auth_access_token or (existing.mini_auth_access_token if existing else "")).strip()
    if not mini:
        raise ValueError("mini_auth_access_token required to exchange platform token")
    creds = exchange_platform_token_sync(
        proxy_base_url=proxy_base_url,
        mini_auth_access_token=mini,
        timeout_s=timeout_s,
    )
    save_platform_credentials(user_data_dir, creds)
    return creds


def platform_proxy_mode_enabled(settings: Any) -> bool:
    return bool((getattr(settings, "platform_proxy_base_url", None) or "").strip())
