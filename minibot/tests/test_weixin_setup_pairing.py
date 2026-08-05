"""Weixin QR setup + pairing unit tests (no live WeChat network)."""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx

from minibot.channels.factory import resolve_weixin_config
from minibot.channels.pairing import PairingStore
from minibot.channels.weixin_setup import WeixinPersistedConfig, WeixinSetupManager
from minibot.config.app_config import AppConfig, weixin_public_payload
from minibot.config.settings import Settings


def test_weixin_public_payload_masks_token() -> None:
    cfg = WeixinPersistedConfig(
        enabled=True,
        token="supersecret-token",
        bot_name="助手",
    )
    pub = weixin_public_payload(cfg)
    assert pub["connected"] is True
    assert pub["configured"] is True
    assert pub["has_token"] is True
    assert "supersecret" not in str(pub)
    assert pub["token_masked"] == "••••••••"


def test_weixin_public_payload_disabled_still_configured() -> None:
    cfg = WeixinPersistedConfig(enabled=False, token="tok")
    pub = weixin_public_payload(cfg)
    assert pub["configured"] is True
    assert pub["enabled"] is False
    assert pub["connected"] is False


def test_resolve_weixin_prefers_persisted() -> None:
    settings = Settings(weixin_enabled=False)
    config = AppConfig(
        weixin=WeixinPersistedConfig(
            enabled=True,
            token="tok_persisted",
            dm_policy="pairing",
            allow_from=["user_1"],
        )
    )
    got = resolve_weixin_config(settings, config)
    assert got is not None
    assert got.token == "tok_persisted"
    assert got.dm_policy == "pairing"


def test_pairing_store_weixin_channel(tmp_path: Path) -> None:
    store = PairingStore(tmp_path, channel="weixin")
    pending = store.ensure_pending("wx_user_abc", chat_type="p2p")
    assert pending.channel == "weixin"
    assert len(store.list_pending()) == 1

    allowed = store.allow(pending.id)
    assert allowed is not None
    assert store.is_approved("wx_user_abc")


def test_setup_manager_start_mock_success() -> None:
    qr_resp = MagicMock()
    qr_resp.raise_for_status = MagicMock()
    qr_resp.json.return_value = {
        "qrcode": "qr123",
        "qrcode_img_content": "https://weixin.qq.com/q/abc",
    }

    status_resp = MagicMock()
    status_resp.raise_for_status = MagicMock()
    status_resp.json.return_value = {
        "status": "confirmed",
        "bot_token": "tok_mock",
        "ilink_user_id": "user_scanner",
        "baseurl": "https://ilinkai.weixin.qq.com",
    }

    def fake_get(url: str, **kwargs):
        if "get_bot_qrcode" in url:
            return qr_resp
        if "get_qrcode_status" in url:
            return status_resp
        raise AssertionError(f"unexpected url {url}")

    mock_client = MagicMock()
    mock_client.get.side_effect = fake_get
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    mgr = WeixinSetupManager()
    with patch.object(httpx, "Client", return_value=mock_client):
        session = mgr.start(bot_name="测试机器人")
        for _ in range(100):
            if session.status == "success":
                break
            time.sleep(0.01)

    assert session.status == "success"
    assert session.bot_token == "tok_mock"
    assert session.scanner_user_id == "user_scanner"
    assert session.qr_url and "weixin.qq.com" in session.qr_url
    pub = session.public(include_token=True)
    assert pub["bot_token"] == "tok_mock"
