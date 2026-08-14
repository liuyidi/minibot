"""Per-user runtime roots and helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from minibot.agent.approval import ApprovalStore
from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.builtin import register_default_tools
from minibot.agent.tools.mcp import McpManager
from minibot.bus.queue import MessageBus
from minibot.channels.factory import auto_approve_channels_from_settings, build_channel_manager
from minibot.channels.manager import ChannelManager
from minibot.config.app_config import AppConfig, default_config_from_settings, load_app_config, save_app_config
from minibot.config.settings import Settings
from minibot.observability.usage_budget import UsageBudget
from minibot.sandbox.base import SandboxBackend
from minibot.session.store import SessionStore

_SAFE_SEGMENT = re.compile(r"[^a-zA-Z0-9._-]+")


def _safe_segment(value: str) -> str:
    text = _SAFE_SEGMENT.sub("_", value.strip())
    return text.strip("._") or "user"


def resolve_user_root(settings: Settings, user_id: str) -> Path:
    return settings.data_dir.expanduser() / "users" / _safe_segment(user_id)


@dataclass
class UserRuntime:
    user_id: str
    root: Path
    config: AppConfig
    sessions: SessionStore
    approvals: ApprovalStore
    usage_budget: UsageBudget
    tools: Any
    runner: AgentRunner
    loop: AgentLoop
    mcp: McpManager
    channels: ChannelManager

    def save_config(self) -> None:
        save_app_config(self.config, path=self.root / "config.json")


def build_user_runtime(
    *,
    settings: Settings,
    bus: MessageBus,
    sandbox_backend: SandboxBackend,
    user_id: str,
) -> UserRuntime:
    root = resolve_user_root(settings, user_id)
    root.mkdir(parents=True, exist_ok=True)
    config_path = root / "config.json"
    config = load_app_config(path=config_path) if config_path.exists() else default_config_from_settings(settings)
    tools = register_default_tools(backend=sandbox_backend)
    from minibot.agent.approval import ApprovalPolicy

    tools.approval_policy = ApprovalPolicy(
        auto_approve_channels=auto_approve_channels_from_settings(settings, config)
    )
    mcp = McpManager(tools)
    from minibot.providers.factory import build_provider_chain

    runner = AgentRunner(build_provider_chain(config))
    sessions = SessionStore(root)
    approvals = ApprovalStore(root)
    usage_budget = UsageBudget(
        root,
        daily_token_limit=settings.daily_token_limit,
        daily_turn_limit=settings.daily_turn_limit,
    )
    loop = AgentLoop(
        sessions=sessions,
        tools=tools,
        runner=runner,
        config=config,
        approvals=approvals,
        usage_budget=usage_budget,
    )
    channels = build_channel_manager(settings, bus, config=config)
    return UserRuntime(
        user_id=user_id,
        root=root,
        config=config,
        sessions=sessions,
        approvals=approvals,
        usage_budget=usage_budget,
        tools=tools,
        runner=runner,
        loop=loop,
        mcp=mcp,
        channels=channels,
    )
