"""Feishu QR setup + pairing unit tests (no live Feishu network)."""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import patch

import lark_oapi

from minibot.channels.factory import resolve_feishu_config
from minibot.channels.feishu_setup import FeishuPersistedConfig, FeishuSetupManager
from minibot.channels.pairing import PairingStore
from minibot.config.app_config import AppConfig, feishu_public_payload
from minibot.config.settings import Settings


def test_feishu_public_payload_masks_secret() -> None:
    cfg = FeishuPersistedConfig(
        enabled=True,
        app_id="cli_x",
        app_secret="supersecret",
        bot_name="助手",
    )
    pub = feishu_public_payload(cfg)
    assert pub["connected"] is True
    assert pub["configured"] is True
    assert pub["app_id"] == "cli_x"
    assert "supersecret" not in str(pub)
    assert pub["has_app_secret"] is True


def test_resolve_feishu_prefers_persisted() -> None:
    settings = Settings(feishu_enabled=False)
    config = AppConfig(
        feishu=FeishuPersistedConfig(
            enabled=True,
            app_id="cli_p",
            app_secret="sec",
            dm_policy="pairing",
            allow_from=["ou_1"],
        )
    )
    got = resolve_feishu_config(settings, config)
    assert got is not None
    assert got.app_id == "cli_p"
    assert got.dm_policy == "pairing"


def test_pairing_store_allow_ignore(tmp_path: Path) -> None:
    store = PairingStore(tmp_path)
    pending = store.ensure_pending("ou_abc", chat_type="p2p")
    assert len(store.list_pending()) == 1
    again = store.ensure_pending("ou_abc")
    assert again.id == pending.id

    allowed = store.allow(pending.id)
    assert allowed is not None
    assert store.is_approved("ou_abc")
    assert store.list_pending() == []

    p2 = store.ensure_pending("ou_deny")
    ignored = store.ignore(p2.id)
    assert ignored is not None
    assert not store.is_approved("ou_deny")


def test_setup_manager_start_mock_success() -> None:
    def fake_register_app(**kwargs):
        kwargs["on_qr_code"]({"url": "https://accounts.feishu.cn/page/x?ticket=1", "expire_in": 600})
        return {
            "client_id": "cli_mock",
            "client_secret": "sec_mock",
            "user_info": {"open_id": "ou_scanner"},
        }

    mgr = FeishuSetupManager()
    with patch.object(lark_oapi, "register_app", fake_register_app):
        session = mgr.start(bot_name="测试机器人")
        for _ in range(100):
            if session.status == "success":
                break
            time.sleep(0.01)

    assert session.status == "success"
    assert session.app_id == "cli_mock"
    assert session.app_secret == "sec_mock"
    assert session.scanner_open_id == "ou_scanner"
    assert session.qr_url and "feishu.cn" in session.qr_url
    pub = session.public(include_secret=True)
    assert pub["app_secret"] == "sec_mock"
