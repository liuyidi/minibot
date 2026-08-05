"""Persisted Feishu channel config + QR setup sessions."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field

log = logging.getLogger("minibot.channels.feishu_setup")

DmPolicy = Literal["pairing", "allowlist", "open"]


class FeishuPersistedConfig(BaseModel):
    enabled: bool = False
    app_id: str = ""
    app_secret: str = ""
    bot_name: str = ""
    domain: Literal["feishu", "lark"] = "feishu"
    dm_policy: DmPolicy = "pairing"
    allow_from: list[str] = Field(default_factory=list)
    group_policy: Literal["open", "mention"] = "mention"


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


@dataclass
class FeishuSetupSession:
    id: str
    status: SetupStatus = "starting"
    qr_url: str | None = None
    expire_in: int | None = None
    created_at: float = field(default_factory=time.time)
    app_id: str = ""
    app_secret: str = ""
    bot_name: str = ""
    scanner_open_id: str = ""
    error: str | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None

    def public(self, *, include_secret: bool = False) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "status": self.status,
            "qr_url": self.qr_url,
            "expire_in": self.expire_in,
            "bot_name": self.bot_name,
            "app_id": self.app_id,
            "scanner_open_id": self.scanner_open_id,
            "error": self.error,
            "created_at": self.created_at,
        }
        if include_secret and self.app_secret:
            out["app_secret"] = self.app_secret
        elif self.app_secret:
            out["app_secret_masked"] = "••••••••"
            out["has_app_secret"] = True
        else:
            out["has_app_secret"] = False
        return out


_DEFAULT_ADDONS: dict[str, Any] = {
    "scopes": {
        "tenant": [
            "im:message",
            "im:message:send_as_bot",
            "im:message.p2p_msg:readonly",
            "im:message.group_at_msg:readonly",
            "im:chat",
        ],
    },
    "events": {
        "items": {
            "tenant": ["im.message.receive_v1"],
        }
    },
}


class FeishuSetupManager:
    """In-memory QR registration sessions (one active flow at a time is typical)."""

    def __init__(self) -> None:
        self._sessions: dict[str, FeishuSetupSession] = {}
        self._lock = threading.Lock()

    def get(self, setup_id: str) -> FeishuSetupSession | None:
        return self._sessions.get(setup_id)

    def start(
        self,
        *,
        domain: str = "feishu",
        bot_name: str = "minibot",
        create_only: bool = True,
    ) -> FeishuSetupSession:
        try:
            import lark_oapi as lark
            from lark_oapi.scene.registration.errors import (
                AppAccessDeniedError,
                AppExpiredError,
                RegisterAppError,
            )
        except ImportError as exc:
            raise RuntimeError(
                "lark-oapi not installed; run: pip install 'minibot[feishu]'"
            ) from exc

        sid = f"fsu_{uuid.uuid4().hex[:16]}"
        session = FeishuSetupSession(id=sid, bot_name=bot_name)
        with self._lock:
            self._sessions[sid] = session

        accounts_domain = (
            "https://accounts.larksuite.com"
            if domain == "lark"
            else "https://accounts.feishu.cn"
        )
        lark_domain = "https://accounts.larksuite.com"

        def on_qr_code(info: dict[str, Any]) -> None:
            session.qr_url = str(info.get("url") or "")
            session.expire_in = int(info.get("expire_in") or 600)
            session.status = "pending"

        def on_status_change(info: dict[str, Any]) -> None:
            status = str(info.get("status") or "")
            if status in {"polling", "slow_down", "domain_switched"}:
                session.status = "polling"

        def worker() -> None:
            try:
                result = lark.register_app(
                    on_qr_code=on_qr_code,
                    on_status_change=on_status_change,
                    source="minibot",
                    cancel_event=session.cancel_event,
                    domain=accounts_domain,
                    lark_domain=lark_domain,
                    app_preset={
                        "name": bot_name,
                        "desc": "minibot Feishu channel",
                    },
                    addons=_DEFAULT_ADDONS,
                    create_only=create_only,
                )
                session.app_id = str(result.get("client_id") or "")
                session.app_secret = str(result.get("client_secret") or "")
                user_info = result.get("user_info") or {}
                if isinstance(user_info, dict):
                    session.scanner_open_id = str(user_info.get("open_id") or "")
                session.status = "success"
                log.info(
                    "feishu setup success id=%s app_id=%s scanner=%s",
                    sid,
                    session.app_id,
                    session.scanner_open_id[:12] if session.scanner_open_id else "",
                )
            except AppAccessDeniedError as exc:
                session.status = "denied"
                session.error = str(exc)
            except AppExpiredError as exc:
                session.status = "expired"
                session.error = str(exc)
            except RegisterAppError as exc:
                if getattr(exc, "code", "") == "abort":
                    session.status = "cancelled"
                else:
                    session.status = "error"
                    session.error = f"{exc.code}: {exc.description}"
            except Exception as exc:  # noqa: BLE001
                if session.cancel_event.is_set():
                    session.status = "cancelled"
                else:
                    session.status = "error"
                    session.error = f"{type(exc).__name__}: {exc}"
                    log.exception("feishu setup failed id=%s", sid)

        thread = threading.Thread(target=worker, name=f"feishu-setup-{sid}", daemon=True)
        session.thread = thread
        thread.start()
        return session

    def cancel(self, setup_id: str) -> FeishuSetupSession | None:
        session = self._sessions.get(setup_id)
        if session is None:
            return None
        session.cancel_event.set()
        if session.status not in {"success", "denied", "expired", "error", "cancelled"}:
            session.status = "cancelled"
        return session

    def refresh(
        self,
        setup_id: str,
        *,
        domain: str = "feishu",
        bot_name: str = "minibot",
    ) -> FeishuSetupSession:
        self.cancel(setup_id)
        return self.start(domain=domain, bot_name=bot_name)
