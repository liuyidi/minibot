"""Feishu channel wiring (Phase 15 subset) — no live Feishu API."""

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


class _FakeFeishu(BaseChannel):
    name = "feishu"
    display_name = "Feishu"

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


def test_inbound_session_key_override() -> None:
    msg = InboundMessage(
        channel="feishu",
        sender_id="ou_1",
        chat_id="oc_chat",
        content="hi",
        session_key_override="feishu:oc_chat:topic_9",
    )
    assert msg.session_key == "feishu:oc_chat:topic_9"
    plain = InboundMessage(channel="feishu", sender_id="ou_1", chat_id="oc_chat", content="hi")
    assert plain.session_key == "feishu:oc_chat"
    ws = InboundMessage(channel="websocket", sender_id="u", chat_id="chat_abc", content="hi")
    assert ws.session_key == "chat_abc"


def test_approval_policy_auto_approve_feishu() -> None:
    class _Tool:
        name = "exec"
        approval_mode = "policy"
        risk = "critical"
        source = "builtin"

    policy = ApprovalPolicy(auto_approve_channels={"feishu"})
    token = bind_channel("feishu")
    try:
        need, *_ = policy.check(_Tool(), {})
        assert need is False
    finally:
        reset_channel(token)

    token = bind_channel("websocket")
    try:
        need, *_ = policy.check(_Tool(), {"command": "sudo id"})
        assert need is True
    finally:
        reset_channel(token)


@pytest.mark.asyncio
async def test_channel_manager_deliver_routes_to_feishu() -> None:
    bus = MessageBus()
    manager = ChannelManager(bus)
    fake = _FakeFeishu(bus)
    manager.register(fake)
    await manager.deliver(
        OutboundMessage(channel="feishu", chat_id="oc_1", content="hello from bot")
    )
    assert len(fake.sent) == 1
    assert fake.sent[0].content == "hello from bot"
    assert await manager.deliver(OutboundMessage(channel="telegram", chat_id="x", content="nope")) is False


@pytest.mark.asyncio
async def test_bus_worker_creates_feishu_session_and_replies(tmp_path, monkeypatch) -> None:
    class _Loop:
        _entry_counts = {"feishu": 0, "ws": 0, "cron": 0, "unknown": 0}

        async def handle_turn(self, session_id: str, content: str, **kwargs: Any) -> Any:
            from types import SimpleNamespace

            assert session_id.startswith("feishu:")
            assert kwargs.get("channel") == "feishu"
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
    fake = _FakeFeishu(bus)
    runtime = state.runtime_for("system")
    runtime.loop = _Loop()  # type: ignore[assignment]
    runtime.channels.register(fake)
    worker = BusWorker(state)
    state.bus_worker = worker
    worker.start()
    try:
        await bus.publish_inbound(
            InboundMessage(
                channel="feishu",
                sender_id="ou_x",
                chat_id="oc_room",
                content="你好",
                user_id="system",
            )
        )
        for _ in range(50):
            if fake.sent:
                break
            await asyncio.sleep(0.05)
        assert runtime.sessions.get("feishu:oc_room") is not None
        assert fake.sent
        assert fake.sent[0].chat_id == "oc_room"
        assert "你好" in fake.sent[0].content
    finally:
        await worker.stop()
