"""Personal WeChat (微信) channel — text-only long-poll (Phase 1)."""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from collections import OrderedDict
from contextlib import suppress
from pathlib import Path
from typing import Any

import httpx
from pydantic import Field

from minibot.bus.events import OutboundMessage
from minibot.bus.queue import MessageBus
from minibot.channels.base import BaseChannel
from minibot.channels.config_base import Base
from minibot.channels.weixin_setup import (
    BASE_INFO,
    DEFAULT_BASE_URL,
    ILINK_APP_CLIENT_VERSION,
    ILINK_APP_ID,
    _random_wechat_uin,
)

ITEM_TEXT = 1
MESSAGE_TYPE_BOT = 2
MESSAGE_STATE_FINISH = 2
ERRCODE_SESSION_EXPIRED = -14
SESSION_PAUSE_DURATION_S = 60 * 60
CONTEXT_TOKEN_MAX_AGE_S = 60
MAX_CONSECUTIVE_FAILURES = 3
BACKOFF_DELAY_S = 30
RETRY_DELAY_S = 2
WEIXIN_MAX_MESSAGE_LEN = 4000


class WeixinConfig(Base):
    enabled: bool = False
    token: str = ""
    base_url: str = DEFAULT_BASE_URL
    poll_timeout: int = 35
    allow_from: list[str] = Field(default_factory=list)
    streaming: bool = False


class WeixinChannel(BaseChannel):
    name = "weixin"
    display_name = "WeChat"

    @classmethod
    def default_config(cls) -> dict[str, Any]:
        return WeixinConfig().model_dump(by_alias=True)

    def __init__(self, config: Any, bus: MessageBus, **kwargs: Any) -> None:
        if isinstance(config, dict):
            config = WeixinConfig.model_validate(config)
        super().__init__(config, bus, **kwargs)
        self.config: WeixinConfig = config
        self._client: httpx.AsyncClient | None = None
        self._token = ""
        self._get_updates_buf = ""
        self._context_tokens: dict[str, str] = {}
        self._context_token_at: dict[str, float] = {}
        self._processed_ids: OrderedDict[str, None] = OrderedDict()
        self._next_poll_timeout_s = self.config.poll_timeout
        self._session_pause_until = 0.0

    def _state_dir(self) -> Path:
        from minibot.channels.paths import get_data_dir

        d = get_data_dir() / "weixin"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _load_state(self) -> bool:
        state_file = self._state_dir() / "account.json"
        if not state_file.exists():
            return False
        try:
            data = json.loads(state_file.read_text(encoding="utf-8"))
            self._token = str(data.get("token") or "")
            self._get_updates_buf = str(data.get("get_updates_buf") or "")
            context_tokens = data.get("context_tokens", {})
            if isinstance(context_tokens, dict):
                self._context_tokens = {
                    str(user_id): str(token)
                    for user_id, token in context_tokens.items()
                    if str(user_id).strip() and str(token).strip()
                }
            base_url = str(data.get("base_url") or "")
            if base_url:
                self.config.base_url = base_url
            return bool(self._token)
        except Exception:  # noqa: BLE001
            self.logger.exception("Failed to load Weixin account state")
            return False

    def _save_state(self) -> None:
        state_file = self._state_dir() / "account.json"
        with suppress(Exception):
            data = {
                "token": self._token,
                "get_updates_buf": self._get_updates_buf,
                "context_tokens": self._context_tokens,
                "base_url": self.config.base_url,
            }
            tmp = state_file.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, state_file)

    def _make_headers(self, *, auth: bool = True) -> dict[str, str]:
        headers: dict[str, str] = {
            "X-WECHAT-UIN": _random_wechat_uin(),
            "Content-Type": "application/json",
            "AuthorizationType": "ilink_bot_token",
            "iLink-App-Id": ILINK_APP_ID,
            "iLink-App-ClientVersion": str(ILINK_APP_CLIENT_VERSION),
        }
        if auth and self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers

    async def _api_post(self, endpoint: str, body: dict | None = None, *, auth: bool = True) -> dict:
        assert self._client is not None
        url = f"{self.config.base_url.rstrip('/')}/{endpoint}"
        payload = dict(body or {})
        if "base_info" not in payload:
            payload["base_info"] = BASE_INFO
        resp = await self._client.post(url, json=payload, headers=self._make_headers(auth=auth))
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, dict) else {}

    def is_allowed(self, sender_id: str) -> bool:
        dm_policy = str(getattr(self, "dm_policy", None) or "")
        if dm_policy == "open":
            return True
        return super().is_allowed(sender_id)

    async def _enqueue_pairing(self, sender_id: str, *, context_token: str) -> None:
        try:
            from minibot.channels.pairing import PairingStore
            from minibot.config.settings import get_settings

            store = PairingStore(get_settings().data_dir, channel="weixin")
            item = store.ensure_pending(sender_id, chat_type="p2p")
            self.logger.info("Weixin pairing pending id={} sender={}", item.id, sender_id)
        except Exception:  # noqa: BLE001
            self.logger.exception("Failed to enqueue pairing for {}", sender_id)
            return
        if not context_token:
            self.logger.warning(
                "Access denied for sender {}; cannot send WeChat pairing notice without context_token",
                sender_id,
            )
            return
        try:
            await self._send_text(
                sender_id,
                (
                    "收到配对请求。请在 minibot「设置 → 渠道 → 配对管理」中点击允许。"
                    f"\nYour id: `{sender_id}`"
                ),
                context_token,
            )
        except Exception:  # noqa: BLE001
            self.logger.exception("Failed to send pairing notice to {}", sender_id)

    async def start(self) -> None:
        if not self.config.token and not self._load_state():
            self.logger.error("Weixin token not configured; use WebUI QR setup")
            return

        if self.config.token:
            self._token = self.config.token
        elif not self._token:
            self._load_state()

        if not self._token:
            self.logger.error("Weixin token missing after load")
            return

        self._running = True
        self._next_poll_timeout_s = max(int(self.config.poll_timeout or 35), 5)
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self._next_poll_timeout_s + 10, connect=30),
            follow_redirects=True,
        )
        self.logger.info("Weixin channel starting long-poll base_url={}", self.config.base_url)

        consecutive_failures = 0
        while self._running:
            try:
                await self._poll_once()
                consecutive_failures = 0
            except httpx.TimeoutException:
                continue
            except Exception:  # noqa: BLE001
                if not self._running:
                    break
                self.logger.exception("Weixin poll loop error")
                consecutive_failures += 1
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    consecutive_failures = 0
                    await asyncio.sleep(BACKOFF_DELAY_S)
                else:
                    await asyncio.sleep(RETRY_DELAY_S)

    async def stop(self) -> None:
        self._running = False
        if self._client:
            await self._client.aclose()
            self._client = None
        self._save_state()

    def _session_pause_remaining_s(self) -> int:
        remaining = int(self._session_pause_until - time.time())
        if remaining <= 0:
            self._session_pause_until = 0.0
            return 0
        return remaining

    async def _poll_once(self) -> None:
        remaining = self._session_pause_remaining_s()
        if remaining > 0:
            await asyncio.sleep(remaining)
            return

        body: dict[str, Any] = {
            "get_updates_buf": self._get_updates_buf,
            "base_info": BASE_INFO,
        }
        assert self._client is not None
        self._client.timeout = httpx.Timeout(self._next_poll_timeout_s + 10, connect=30)
        data = await self._api_post("ilink/bot/getupdates", body)

        ret = data.get("ret", 0)
        errcode = data.get("errcode", 0)
        is_error = (ret is not None and ret != 0) or (errcode is not None and errcode != 0)
        if is_error:
            if errcode == ERRCODE_SESSION_EXPIRED or ret == ERRCODE_SESSION_EXPIRED:
                self._session_pause_until = time.time() + SESSION_PAUSE_DURATION_S
                self.logger.warning("Weixin session expired (errcode {}); pausing", errcode)
                return
            raise RuntimeError(
                f"getUpdates failed: ret={ret} errcode={errcode} errmsg={data.get('errmsg', '')}"
            )

        server_timeout_ms = data.get("longpolling_timeout_ms")
        if server_timeout_ms and server_timeout_ms > 0:
            self._next_poll_timeout_s = max(int(server_timeout_ms) // 1000, 5)

        new_buf = data.get("get_updates_buf", "")
        if new_buf:
            self._get_updates_buf = str(new_buf)
            self._save_state()

        msgs: list[dict] = data.get("msgs", []) or []
        for msg in msgs:
            try:
                await self._process_message(msg)
            except Exception:  # noqa: BLE001
                self.logger.exception("Failed to process Weixin message")

    async def _process_message(self, msg: dict) -> None:
        if msg.get("message_type") == MESSAGE_TYPE_BOT:
            return

        msg_id = str(msg.get("message_id", "") or msg.get("seq", ""))
        if not msg_id:
            msg_id = f"{msg.get('from_user_id', '')}_{msg.get('create_time_ms', '')}"

        from_user_id = str(msg.get("from_user_id") or "")
        if not from_user_id:
            return

        if from_user_id.endswith("@chatroom"):
            return

        if msg_id in self._processed_ids:
            return
        self._processed_ids[msg_id] = None
        while len(self._processed_ids) > 1000:
            self._processed_ids.popitem(last=False)

        ctx_token = str(msg.get("context_token") or "")
        dm_policy = str(getattr(self, "dm_policy", None) or "allowlist")

        if not self.is_allowed(from_user_id):
            if dm_policy == "pairing" and ctx_token:
                await self._enqueue_pairing(from_user_id, context_token=ctx_token)
            elif dm_policy == "pairing":
                self.logger.warning(
                    "Access denied for sender {}; no context_token for pairing notice",
                    from_user_id,
                )
            else:
                self.logger.warning("Access denied for sender {}", from_user_id)
            return

        if ctx_token:
            self._context_tokens[from_user_id] = ctx_token
            self._context_token_at[from_user_id] = time.time()
            self._save_state()

        content = self._extract_text(msg)
        if not content.strip():
            return

        await self._handle_message(
            sender_id=from_user_id,
            chat_id=from_user_id,
            content=content,
            metadata={"message_id": msg_id},
            is_dm=True,
        )

    @staticmethod
    def _extract_text(msg: dict) -> str:
        parts: list[str] = []
        for item in msg.get("item_list") or []:
            if item.get("type", 0) != ITEM_TEXT:
                continue
            text = str((item.get("text_item") or {}).get("text") or "")
            if text:
                parts.append(text)
        return "\n".join(parts)

    async def _refresh_context_token_if_stale(self, chat_id: str, context_token: str) -> str:
        if not context_token:
            return context_token
        now = time.time()
        cached_at = self._context_token_at.get(chat_id, 0)
        if now - cached_at < CONTEXT_TOKEN_MAX_AGE_S:
            return context_token

        body: dict[str, Any] = {
            "ilink_user_id": chat_id,
            "context_token": context_token,
            "base_info": BASE_INFO,
        }
        try:
            data = await self._api_post("ilink/bot/getconfig", body)
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("Weixin getconfig failed for {}: {}", chat_id, exc)
            return context_token

        if data.get("ret", 0) != 0:
            return context_token

        new_token = str(data.get("context_token") or "")
        if new_token and new_token != context_token:
            self._context_tokens[chat_id] = new_token
            self._context_token_at[chat_id] = now
            self._save_state()
            return new_token
        return context_token

    async def _send_text(self, to_user_id: str, text: str, context_token: str) -> None:
        client_id = f"minibot-{uuid.uuid4().hex[:12]}"
        item_list: list[dict] = []
        if text:
            item_list.append({"type": ITEM_TEXT, "text_item": {"text": text}})

        weixin_msg: dict[str, Any] = {
            "from_user_id": "",
            "to_user_id": to_user_id,
            "client_id": client_id,
            "message_type": MESSAGE_TYPE_BOT,
            "message_state": MESSAGE_STATE_FINISH,
        }
        if item_list:
            weixin_msg["item_list"] = item_list
        if context_token:
            weixin_msg["context_token"] = context_token

        data = await self._api_post("ilink/bot/sendmessage", {"msg": weixin_msg})
        ret = data.get("ret", 0)
        errcode = data.get("errcode", 0)
        if (ret is not None and ret != 0) or (errcode is not None and errcode != 0):
            raise RuntimeError(
                f"Weixin send text error (ret={ret}, errcode={errcode}): {data.get('errmsg', '')}"
            )

    async def send(self, msg: OutboundMessage) -> None:
        content = (msg.content or "").strip()
        if not content:
            return

        ctx_token = self._context_tokens.get(msg.chat_id, "")
        ctx_token = await self._refresh_context_token_if_stale(msg.chat_id, ctx_token)
        if not ctx_token:
            raise RuntimeError(
                f"Weixin context_token missing for chat_id={msg.chat_id}, cannot send"
            )

        if len(content) > WEIXIN_MAX_MESSAGE_LEN:
            chunks = [
                content[i : i + WEIXIN_MAX_MESSAGE_LEN]
                for i in range(0, len(content), WEIXIN_MAX_MESSAGE_LEN)
            ]
            for chunk in chunks:
                await self._send_text(msg.chat_id, chunk, ctx_token)
            return

        await self._send_text(msg.chat_id, content, ctx_token)

