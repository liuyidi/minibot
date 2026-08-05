"""Persisted WeChat (weixin) channel config + QR setup sessions."""

from __future__ import annotations

import base64
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

log = logging.getLogger("minibot.channels.weixin_setup")

DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com"
WEIXIN_CHANNEL_VERSION = "2.1.1"
ILINK_APP_ID = "bot"


def _build_client_version(version: str) -> int:
    parts = version.split(".")

    def _as_int(idx: int) -> int:
        try:
            return int(parts[idx])
        except Exception:
            return 0

    major = _as_int(0)
    minor = _as_int(1)
    patch = _as_int(2)
    return ((major & 0xFF) << 16) | ((minor & 0xFF) << 8) | (patch & 0xFF)


ILINK_APP_CLIENT_VERSION = _build_client_version(WEIXIN_CHANNEL_VERSION)
BASE_INFO: dict[str, str] = {"channel_version": WEIXIN_CHANNEL_VERSION}
MAX_QR_REFRESH_COUNT = 3

DmPolicy = Literal["pairing", "allowlist", "open"]


class WeixinPersistedConfig(BaseModel):
    enabled: bool = False
    token: str = ""
    bot_name: str = ""
    dm_policy: DmPolicy = "pairing"
    allow_from: list[str] = Field(default_factory=list)
    base_url: str = DEFAULT_BASE_URL
    poll_timeout: int = 35


SetupStatus = Literal[
    "starting",
    "pending",
    "polling",
    "success",
    "denied",
    "expired",
    "error",
    "cancelled",
]


def _random_wechat_uin() -> str:
    uint32 = int.from_bytes(os.urandom(4), "big")
    return base64.b64encode(str(uint32).encode()).decode()


def _make_headers(*, auth: bool = False, token: str = "") -> dict[str, str]:
    headers: dict[str, str] = {
        "X-WECHAT-UIN": _random_wechat_uin(),
        "Content-Type": "application/json",
        "AuthorizationType": "ilink_bot_token",
        "iLink-App-Id": ILINK_APP_ID,
        "iLink-App-ClientVersion": str(ILINK_APP_CLIENT_VERSION),
    }
    if auth and token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _classify_qr_content(content: str) -> tuple[str | None, str | None]:
    text = (content or "").strip()
    if not text:
        return None, None
    if text.startswith("data:"):
        return None, text
    if text.startswith("http://") or text.startswith("https://"):
        return text, None
    if len(text) > 256 and all(c.isalnum() or c in "+/=\n" for c in text[:80]):
        data_url = text if text.startswith("data:") else f"data:image/png;base64,{text}"
        return None, data_url
    return text, None


def _is_retryable_qr_poll_error(err: Exception) -> bool:
    if isinstance(err, httpx.TimeoutException | httpx.TransportError):
        return True
    if isinstance(err, httpx.HTTPStatusError):
        status_code = err.response.status_code if err.response is not None else 0
        return status_code >= 500
    return False


@dataclass
class WeixinSetupSession:
    id: str
    status: SetupStatus = "starting"
    qr_url: str | None = None
    qr_image_base64: str | None = None
    expire_in: int | None = None
    created_at: float = field(default_factory=time.time)
    bot_name: str = ""
    bot_token: str = ""
    scanner_user_id: str = ""
    base_url: str = DEFAULT_BASE_URL
    error: str | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None

    def public(self, *, include_token: bool = False) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "status": self.status,
            "qr_url": self.qr_url,
            "qr_image_base64": self.qr_image_base64,
            "expire_in": self.expire_in,
            "bot_name": self.bot_name,
            "scanner_user_id": self.scanner_user_id,
            "base_url": self.base_url,
            "error": self.error,
            "created_at": self.created_at,
        }
        if include_token and self.bot_token:
            out["bot_token"] = self.bot_token
        elif self.bot_token:
            out["has_bot_token"] = True
            out["bot_token_masked"] = "••••••••"
        else:
            out["has_bot_token"] = False
        return out


class WeixinSetupManager:
    """In-memory QR login sessions (sync httpx in a daemon thread)."""

    def __init__(self) -> None:
        self._sessions: dict[str, WeixinSetupSession] = {}
        self._lock = threading.Lock()

    def get(self, setup_id: str) -> WeixinSetupSession | None:
        return self._sessions.get(setup_id)

    def start(self, *, bot_name: str = "minibot", base_url: str = DEFAULT_BASE_URL) -> WeixinSetupSession:
        sid = f"wxu_{uuid.uuid4().hex[:16]}"
        session = WeixinSetupSession(id=sid, bot_name=bot_name, base_url=base_url or DEFAULT_BASE_URL)
        with self._lock:
            self._sessions[sid] = session

        def worker() -> None:
            try:
                self._run_qr_login(session)
            except Exception as exc:  # noqa: BLE001
                if session.cancel_event.is_set():
                    session.status = "cancelled"
                else:
                    session.status = "error"
                    session.error = f"{type(exc).__name__}: {exc}"
                    log.exception("weixin setup failed id=%s", sid)

        thread = threading.Thread(target=worker, name=f"weixin-setup-{sid}", daemon=True)
        session.thread = thread
        thread.start()
        return session

    def _run_qr_login(self, session: WeixinSetupSession) -> None:
        base_url = session.base_url.rstrip("/") or DEFAULT_BASE_URL
        timeout = httpx.Timeout(60, connect=30)
        refresh_count = 0
        current_poll_base_url = base_url

        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            qrcode_id, scan_content = self._fetch_qr_code(client, base_url)
            self._apply_qr_content(session, scan_content)
            session.status = "pending"
            session.expire_in = 600

            while not session.cancel_event.is_set():
                try:
                    status_data = self._poll_qr_status(client, current_poll_base_url, qrcode_id)
                except Exception as exc:
                    if _is_retryable_qr_poll_error(exc):
                        time.sleep(1)
                        continue
                    raise

                if not isinstance(status_data, dict):
                    time.sleep(1)
                    continue

                status = str(status_data.get("status") or "")
                if status == "confirmed":
                    token = str(status_data.get("bot_token") or "")
                    user_id = str(status_data.get("ilink_user_id") or "")
                    redirect_base = str(status_data.get("baseurl") or "")
                    if token:
                        session.bot_token = token
                        session.scanner_user_id = user_id
                        if redirect_base:
                            session.base_url = redirect_base.rstrip("/")
                        session.status = "success"
                        log.info(
                            "weixin setup success id=%s user_id=%s",
                            session.id,
                            user_id[:12] if user_id else "",
                        )
                        return
                    session.status = "error"
                    session.error = "Login confirmed but no bot_token in response"
                    return

                if status == "scaned_but_redirect":
                    redirect_host = str(status_data.get("redirect_host") or "").strip()
                    if redirect_host:
                        if redirect_host.startswith("http://") or redirect_host.startswith("https://"):
                            current_poll_base_url = redirect_host.rstrip("/")
                        else:
                            current_poll_base_url = f"https://{redirect_host}".rstrip("/")
                elif status == "expired":
                    refresh_count += 1
                    if refresh_count > MAX_QR_REFRESH_COUNT:
                        session.status = "expired"
                        session.error = "QR code expired too many times"
                        return
                    qrcode_id, scan_content = self._fetch_qr_code(client, base_url)
                    self._apply_qr_content(session, scan_content)
                    current_poll_base_url = base_url
                    continue
                elif status in {"wait", "scanned"}:
                    session.status = "polling"

                time.sleep(1)

        if session.cancel_event.is_set():
            session.status = "cancelled"

    @staticmethod
    def _apply_qr_content(session: WeixinSetupSession, content: str) -> None:
        qr_url, qr_image = _classify_qr_content(content)
        session.qr_url = qr_url
        session.qr_image_base64 = qr_image

    @staticmethod
    def _fetch_qr_code(client: httpx.Client, base_url: str) -> tuple[str, str]:
        url = f"{base_url.rstrip('/')}/ilink/bot/get_bot_qrcode"
        resp = client.get(
            url,
            params={"bot_type": "3"},
            headers=_make_headers(auth=False),
        )
        resp.raise_for_status()
        data = resp.json()
        qrcode_id = str(data.get("qrcode") or "")
        qrcode_img_content = str(data.get("qrcode_img_content") or "")
        if not qrcode_id:
            raise RuntimeError(f"Failed to get QR code from WeChat API: {data}")
        return qrcode_id, qrcode_img_content or qrcode_id

    @staticmethod
    def _poll_qr_status(client: httpx.Client, base_url: str, qrcode_id: str) -> dict[str, Any]:
        url = f"{base_url.rstrip('/')}/ilink/bot/get_qrcode_status"
        resp = client.get(
            url,
            params={"qrcode": qrcode_id},
            headers=_make_headers(auth=False),
        )
        resp.raise_for_status()
        payload = resp.json()
        return payload if isinstance(payload, dict) else {}

    def cancel(self, setup_id: str) -> WeixinSetupSession | None:
        session = self._sessions.get(setup_id)
        if session is None:
            return None
        session.cancel_event.set()
        if session.status not in {"success", "denied", "expired", "error", "cancelled"}:
            session.status = "cancelled"
        return session

    def refresh(self, setup_id: str, *, bot_name: str = "minibot", base_url: str = DEFAULT_BASE_URL) -> WeixinSetupSession:
        self.cancel(setup_id)
        return self.start(bot_name=bot_name, base_url=base_url)
