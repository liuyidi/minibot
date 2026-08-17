"""Cloud-side opaque tokens for desktop platform inference proxy."""

from __future__ import annotations

import json
import secrets
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PLATFORM_TOKEN_AUD = "platform-proxy"
PLATFORM_TOKEN_CLIENT = "desktop"


@dataclass(frozen=True)
class PlatformTokenClaims:
    user_id: str
    aud: str = PLATFORM_TOKEN_AUD
    client: str = PLATFORM_TOKEN_CLIENT
    exp: int = 0


class PlatformTokenStore:
    """Persist opaque platform inference tokens under ``data_dir/platform_proxy/``."""

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = Path(data_dir).expanduser()
        self.path = self.data_dir / "platform_proxy" / "tokens.json"
        self._lock = threading.Lock()
        self._tokens: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.is_file():
            self._tokens = {}
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self._tokens = {}
            return
        if isinstance(raw, dict) and isinstance(raw.get("tokens"), dict):
            self._tokens = {str(k): v for k, v in raw["tokens"].items() if isinstance(v, dict)}
        else:
            self._tokens = {}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"tokens": self._tokens}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        tmp.replace(self.path)
        try:
            self.path.chmod(0o600)
        except OSError:
            pass

    def mint(self, *, user_id: str, ttl_s: int = 3600) -> tuple[str, int]:
        uid = (user_id or "").strip()
        if not uid:
            raise ValueError("user_id required")
        ttl = max(60, int(ttl_s))
        token = secrets.token_urlsafe(32)
        exp = int(time.time()) + ttl
        with self._lock:
            self._purge_expired_unlocked()
            self._tokens[token] = {
                "user_id": uid,
                "aud": PLATFORM_TOKEN_AUD,
                "client": PLATFORM_TOKEN_CLIENT,
                "exp": exp,
            }
            self._save()
        return token, ttl

    def validate(self, token: str) -> PlatformTokenClaims | None:
        raw = (token or "").strip()
        if not raw:
            return None
        now = int(time.time())
        with self._lock:
            entry = self._tokens.get(raw)
            if not isinstance(entry, dict):
                return None
            exp = int(entry.get("exp") or 0)
            if exp <= now:
                self._tokens.pop(raw, None)
                self._save()
                return None
            uid = str(entry.get("user_id") or "").strip()
            if not uid:
                return None
            return PlatformTokenClaims(
                user_id=uid,
                aud=str(entry.get("aud") or PLATFORM_TOKEN_AUD),
                client=str(entry.get("client") or PLATFORM_TOKEN_CLIENT),
                exp=exp,
            )

    def revoke(self, token: str) -> None:
        raw = (token or "").strip()
        if not raw:
            return
        with self._lock:
            if raw in self._tokens:
                del self._tokens[raw]
                self._save()

    def _purge_expired_unlocked(self) -> None:
        now = int(time.time())
        dead = [k for k, v in self._tokens.items() if int(v.get("exp") or 0) <= now]
        for k in dead:
            del self._tokens[k]
