"""Weixin channel wiring (Phase 1) — no live WeChat API."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from minibot.agent.approval import ApprovalPolicy
from minibot.app_state import AppState
from minibot.bus.events import InboundMessage, OutboundMessage
from minibot.bus.queue import MessageBus
from minibot.bus.worker import BusWorker
from minibot.channels.base import BaseChannel
from minibot.channels.manager import ChannelManager
from minibot.config.app_config import AppConfig
from minibot.config.settings import Settings
from minibot.sandbox.local import LocalSandboxBackend
from minibot.security.channel_context import bind_channel, reset_channel
from minibot.session.store import SessionStore


class _FakeWeixin(BaseChannel):
    name = "weixin"
    display_name = "WeChat"

    def __init__(self, bus: MessageBus) -> None:
        super().__init__({"enabled": True, "streaming": False, "allow_from": ["*"]}, bus)
        self.sent: list[OutboundMessage] = []
        self._running = False

    async def start(self) -> None:
        self._running = True

    async def stop(self) -> None:
        self._running = False

    async def send(self, msg: OutboundMessage) -> None:
        self.sent.append(msg)


def test_inbound_session_key_weixin() -> None:
    msg = InboundMessage(
        channel="weixin",
        sender_id="wx_user",
        chat_id="wx_user",
        content="hi",
    )
    assert msg.session_key == "weixin:wx_user"


def test_approval_policy_auto_approve_weixin() -> None:
    class _Tool:
        name = "exec"
        approval_mode = "policy"
        risk = "critical"
        source = "builtin"

    policy = ApprovalPolicy(auto_approve_channels={"weixin"})
    token = bind_channel("weixin")
    try:
        need, *_ = policy.check(_Tool(), {})
        assert need is False
    finally:
        reset_channel(token)


@pytest.mark.asyncio
async def test_channel_manager_deliver_routes_to_weixin() -> None:
    bus = MessageBus()
    manager = ChannelManager(bus)
    fake = _FakeWeixin(bus)
    manager.register(fake)
    await manager.deliver(
        OutboundMessage(channel="weixin", chat_id="wx_1", content="hello from bot")
    )
    assert len(fake.sent) == 1
    assert fake.sent[0].content == "hello from bot"


@pytest.mark.asyncio
async def test_bus_worker_creates_weixin_session_and_replies(tmp_path, monkeypatch) -> None:
    class _Loop:
        _entry_counts = {"weixin": 0, "feishu": 0, "ws": 0, "cron": 0, "unknown": 0}

        async def handle_turn(self, session_id: str, content: str, **kwargs: Any) -> Any:
            from types import SimpleNamespace

            assert session_id.startswith("weixin:")
            assert kwargs.get("channel") == "weixin"
            return SimpleNamespace(
                content=f"echo:{content}",
                tools_used=[],
                trace=[],
                stop_reason="end",
                langfuse_trace_id="",
                reasoning="",
            )

    settings = Settings(data_dir=tmp_path)
    bus = MessageBus()
    state = AppState(
        settings=settings,
        bus=bus,
        sessions=SessionStore(data_dir=tmp_path),
        tools=None,  # type: ignore[arg-type]
        runner=None,  # type: ignore[arg-type]
        loop=_Loop(),  # type: ignore[arg-type]
        config=AppConfig(),
        mcp=None,  # type: ignore[arg-type]
        approvals=None,  # type: ignore[arg-type]
        sandbox_backend=LocalSandboxBackend(),
    )
    fake = _FakeWeixin(bus)
    runtime = state.runtime_for("system")
    runtime.loop = _Loop()  # type: ignore[assignment]
    runtime.channels.register(fake)
    worker = BusWorker(state)
    state.bus_worker = worker
    worker.start()
    try:
        await bus.publish_inbound(
            InboundMessage(
                channel="weixin",
                sender_id="wx_x",
                chat_id="wx_x",
                content="你好",
                user_id="system",
            )
        )
        for _ in range(50):
            if fake.sent:
                break
            await asyncio.sleep(0.05)
        assert runtime.sessions.get("weixin:wx_x") is not None
        assert fake.sent
        assert fake.sent[0].chat_id == "wx_x"
        assert "你好" in fake.sent[0].content
    finally:
        await worker.stop()
