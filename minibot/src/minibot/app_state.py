"""Shared application state."""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from minibot.agent.approval import ApprovalStore
from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.builtin import SYSTEM_PROMPT, register_default_tools
from minibot.agent.tools.mcp import McpManager
from minibot.agent.tools.registry import ToolRegistry
from minibot.bus.queue import MessageBus
from minibot.bus.worker import BusWorker
from minibot.channels.factory import auto_approve_channels_from_settings, build_channel_manager
from minibot.channels.manager import ChannelManager
from minibot.config.app_config import AppConfig, load_app_config, save_app_config
from minibot.config.settings import Settings, get_settings
from minibot.cron.service import CronService
from minibot.cron.types import CronJob
from minibot.providers.factory import build_provider_chain
from minibot.providers.fallback import FallbackStats
from minibot.providers.fault_inject import FaultController
from minibot.observability.score_queue import ScoreQueue
from minibot.observability.usage_budget import BudgetExceeded, UsageBudget
from minibot.sandbox.base import SandboxBackend
from minibot.sandbox.factory import build_sandbox_backend
from minibot.session.store import SessionStore


@dataclass
class TokenRecord:
    token: str
    expires_at: float


@dataclass
class MiniAuthLoginRecord:
    code_verifier: str
    next_url: str
    expires_at: float


@dataclass
class AppState:
    settings: Settings
    bus: MessageBus
    sessions: SessionStore
    tools: ToolRegistry
    runner: AgentRunner
    loop: AgentLoop
    config: AppConfig
    mcp: McpManager
    approvals: ApprovalStore
    cron: CronService | None = None
    bus_worker: BusWorker | None = None
    usage_budget: UsageBudget | None = None
    sandbox_backend: SandboxBackend | None = None
    channels: ChannelManager | None = None
    tokens: dict[str, TokenRecord] = field(default_factory=dict)
    mini_auth_logins: dict[str, MiniAuthLoginRecord] = field(default_factory=dict)
    fallback_stats: FallbackStats = field(default_factory=FallbackStats)
    fault_controller: FaultController = field(default_factory=FaultController)
    score_queue: ScoreQueue = field(default_factory=ScoreQueue)
    media_gateway: Any | None = None
    started_at: float = field(default_factory=time.time)

    def is_mini_auth_enabled(self) -> bool:
        return self.settings.normalized_auth_provider() == "mini_auth"

    def rebuild_provider(self) -> None:
        # Platform keys stay in env; do not copy them into config.json.
        provider = build_provider_chain(
            self.config,
            stats=self.fallback_stats,
            fault=self.fault_controller,
        )
        self.runner = AgentRunner(provider)
        self.loop.runner = self.runner

    def issue_token(self, ttl_s: int | None = None) -> str:
        token = secrets.token_urlsafe(24)
        expires_in = self.settings.token_ttl_s if ttl_s is None else max(1, int(ttl_s))
        self.tokens[token] = TokenRecord(
            token=token,
            expires_at=time.time() + expires_in,
        )
        return token

    def revoke_token(self, token: str | None) -> None:
        if token:
            self.tokens.pop(token, None)

    def begin_mini_auth_login(self, next_url: str) -> tuple[str, str]:
        login_state = secrets.token_urlsafe(24)
        code_verifier = secrets.token_urlsafe(64)
        self.mini_auth_logins[login_state] = MiniAuthLoginRecord(
            code_verifier=code_verifier,
            next_url=next_url or "/",
            expires_at=time.time() + 600,
        )
        return login_state, code_verifier

    def consume_mini_auth_login(self, login_state: str) -> MiniAuthLoginRecord | None:
        record = self.mini_auth_logins.pop(login_state, None)
        if record is None:
            return None
        if record.expires_at < time.time():
            return None
        return record

    def check_token(self, token: str | None) -> bool:
        if not self.is_mini_auth_enabled() and not self.settings.require_auth and not self.settings.auth_secret:
            return True
        if not token:
            return False
        if self.settings.auth_secret and secrets.compare_digest(token, self.settings.auth_secret):
            return True
        record = self.tokens.get(token)
        if record is None:
            return False
        if record.expires_at < time.time():
            self.tokens.pop(token, None)
            return False
        return True

    def save_config(self, *, rebuild_provider: bool = True) -> None:
        save_app_config(self.config)
        if rebuild_provider:
            self.rebuild_provider()


def build_app_state() -> AppState:
    settings = get_settings()
    try:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        # Sandbox / restricted homes: fall back to a local writable directory.
        fallback = Path.cwd() / ".minibot-data"
        fallback.mkdir(parents=True, exist_ok=True)
        settings.__dict__["data_dir"] = fallback
    config = load_app_config()
    sandbox_backend = build_sandbox_backend(settings)
    tools = register_default_tools(backend=sandbox_backend)
    from minibot.agent.approval import ApprovalPolicy

    tools.approval_policy = ApprovalPolicy(
        auto_approve_channels=auto_approve_channels_from_settings(settings, config)
    )
    mcp = McpManager(tools)
    fallback_stats = FallbackStats()
    fault_controller = FaultController()
    provider = build_provider_chain(
        config,
        stats=fallback_stats,
        fault=fault_controller,
    )
    runner = AgentRunner(provider)
    sessions = SessionStore(data_dir=settings.data_dir)
    approvals = ApprovalStore(data_dir=settings.data_dir)
    usage_budget = UsageBudget(
        settings.data_dir,
        daily_token_limit=settings.daily_token_limit,
        daily_turn_limit=settings.daily_turn_limit,
    )
    loop = AgentLoop(
        sessions=sessions,
        tools=tools,
        runner=runner,
        config=config,
        approvals=approvals,
        system_prompt=SYSTEM_PROMPT,
        usage_budget=usage_budget,
    )
    from minibot.agent.tools.spawn import attach_spawn_tool

    attach_spawn_tool(tools, loop=loop)
    from minibot.webui.media_gateway import WebUIMediaGateway

    media_gateway = WebUIMediaGateway(
        logger=logging.getLogger("minibot.webui.media"),
        secret=secrets.token_bytes(32),
    )
    state = AppState(
        settings=settings,
        bus=MessageBus(),
        sessions=sessions,
        tools=tools,
        runner=runner,
        loop=loop,
        config=config,
        mcp=mcp,
        approvals=approvals,
        fallback_stats=fallback_stats,
        fault_controller=fault_controller,
        usage_budget=usage_budget,
        sandbox_backend=sandbox_backend,
        media_gateway=media_gateway,
    )
    state.channels = build_channel_manager(settings, state.bus, config=config)
    state.bus_worker = BusWorker(state)
    from minibot.channels.feishu_setup import FeishuSetupManager
    from minibot.channels.weixin_setup import WeixinSetupManager
    from minibot.channels.pairing import PairingStore

    state.feishu_setup = FeishuSetupManager()
    state.feishu_pairing = PairingStore(settings.data_dir)
    state.weixin_setup = WeixinSetupManager()
    state.weixin_pairing = PairingStore(settings.data_dir, channel="weixin")
    cron_path = settings.data_dir.expanduser() / "cron" / "jobs.json"

    async def _on_cron_job(job: CronJob) -> None:
        from minibot.agent.dream import run_dream
        from minibot.agent.heartbeat import run_heartbeat
        from minibot.bus.events import InboundMessage
        from minibot.cron.types import is_system_job

        if state.usage_budget is not None and state.usage_budget.is_tripped():
            raise BudgetExceeded(
                state.usage_budget.snapshot().get("tripped_reason") or "budget",
                snapshot=state.usage_budget.snapshot(),
            )

        if is_system_job(job) or job.id in {"heartbeat", "dream"}:
            if job.id == "heartbeat" or job.name == "heartbeat":
                await run_heartbeat(
                    loop=state.loop,
                    sessions=state.sessions,
                    bus=state.bus,
                    config=state.config,
                )
                return
            if job.id == "dream" or job.name == "dream":
                await run_dream(loop=state.loop, sessions=state.sessions)
                return
            return

        if state.sessions.get(job.session_id) is None:
            raise RuntimeError(f"unknown session_id={job.session_id}")
        # Bus → BusWorker → handle_turn(entry=cron); waiter completes when turn ends.
        assert state.cron is not None
        waiter = state.cron.begin_wait(job.id)
        await state.bus.publish_inbound(
            InboundMessage(
                channel="cron",
                sender_id="cron",
                chat_id=job.session_id,
                content=job.payload.message,
                metadata={
                    "source": "cron",
                    "job_id": job.id,
                    "job_name": job.name,
                },
            )
        )
        await asyncio.wait_for(waiter, timeout=600.0)

    state.cron = CronService(cron_path, on_job=_on_cron_job)
    return state
