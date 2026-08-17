"""Shared application state."""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from minibot.agent.runner import AgentRunner
from minibot.bus.queue import MessageBus
from minibot.bus.worker import BusWorker
from minibot.channels.manager import ChannelManager
from minibot.config.app_config import AppConfig
from minibot.config.settings import Settings, get_settings
from minibot.cron.service import CronService
from minibot.cron.types import CronJob
from minibot.providers.factory import build_provider_chain
from minibot.providers.fallback import FallbackStats
from minibot.providers.fault_inject import FaultController
from minibot.observability.score_queue import ScoreQueue
from minibot.observability.usage_budget import BudgetExceeded
from minibot.sandbox.base import SandboxBackend
from minibot.sandbox.factory import build_sandbox_backend
from minibot.migration import migrate_legacy_user_data
from minibot.user_runtime import UserRuntime, build_user_runtime
from minibot.security.principal_context import current_principal


@dataclass
class TokenRecord:
    token: str
    expires_at: float
    account: dict[str, Any] | None = None


@dataclass
class MiniAuthLoginRecord:
    code_verifier: str
    next_url: str
    expires_at: float
    redirect_uri: str = ""
    desktop_login_id: str = ""


@dataclass
class DesktopHandoffRecord:
    token: str
    expires_at: float
    next_url: str = "/"


@dataclass
class AppState:
    settings: Settings
    bus: MessageBus
    sessions: Any
    tools: Any
    runner: AgentRunner
    loop: Any
    config: AppConfig
    mcp: Any
    approvals: Any
    cron: CronService | None = None
    bus_worker: BusWorker | None = None
    sandbox_backend: SandboxBackend | None = None
    channels: ChannelManager | None = None
    tokens: dict[str, TokenRecord] = field(default_factory=dict)
    mini_auth_logins: dict[str, MiniAuthLoginRecord] = field(default_factory=dict)
    desktop_handoffs: dict[str, DesktopHandoffRecord] = field(default_factory=dict)
    fallback_stats: FallbackStats = field(default_factory=FallbackStats)
    fault_controller: FaultController = field(default_factory=FaultController)
    score_queue: ScoreQueue = field(default_factory=ScoreQueue)
    media_gateway: Any | None = None
    started_at: float = field(default_factory=time.time)
    user_runtimes: dict[str, UserRuntime] = field(default_factory=dict)
    _platform_token_store: Any | None = field(default=None, repr=False)
    _desktop_budget: Any | None = field(default=None, repr=False)

    def platform_token_store(self) -> Any:
        if self._platform_token_store is None:
            from minibot.platform_proxy.tokens import PlatformTokenStore

            self._platform_token_store = PlatformTokenStore(self.settings.data_dir)
        return self._platform_token_store

    def desktop_budget(self) -> Any:
        if self._desktop_budget is None:
            from minibot.platform_proxy.budget import DesktopBudget

            self._desktop_budget = DesktopBudget(
                self.settings.data_dir,
                daily_token_limit=self.settings.desktop_daily_token_limit,
                daily_turn_limit=self.settings.desktop_daily_turn_limit,
            )
        return self._desktop_budget

    def current_user_id(self) -> str:
        principal = current_principal()
        return principal.user_id if principal and principal.user_id else "system"

    def runtime_for(self, user_id: str | None = None) -> UserRuntime:
        uid = (user_id or self.current_user_id() or "system").strip() or "system"
        runtime = self.user_runtimes.get(uid)
        if runtime is None:
            assert self.sandbox_backend is not None
            runtime = build_user_runtime(
                settings=self.settings,
                bus=self.bus,
                sandbox_backend=self.sandbox_backend,
                user_id=uid,
            )
            self.user_runtimes[uid] = runtime
        return runtime

    def preload_user_runtimes(self) -> list[UserRuntime]:
        root = self.settings.data_dir.expanduser() / "users"
        if not root.exists():
            return []
        out: list[UserRuntime] = []
        for entry in sorted(root.iterdir()):
            if not entry.is_dir():
                continue
            user_id = entry.name
            if user_id in self.user_runtimes:
                out.append(self.user_runtimes[user_id])
                continue
            out.append(self.runtime_for(user_id))
        return out

    def find_session_owner(self, session_id: str) -> str | None:
        """Return user_id whose session store contains ``session_id``, if any."""
        sid = (session_id or "").strip()
        if not sid:
            return None
        for runtime in self.preload_user_runtimes():
            if runtime.sessions.get(sid) is not None:
                return runtime.user_id
        system = self.runtime_for("system")
        if system.sessions.get(sid) is not None:
            return "system"
        return None

    @property
    def sessions(self) -> Any:
        return self.runtime_for().sessions

    @sessions.setter
    def sessions(self, value: Any) -> None:
        self.__dict__["_bootstrap_sessions"] = value

    @property
    def tools(self) -> Any:
        return self.runtime_for().tools

    @tools.setter
    def tools(self, value: Any) -> None:
        self.__dict__["_bootstrap_tools"] = value

    @property
    def runner(self) -> AgentRunner:
        return self.runtime_for().runner

    @runner.setter
    def runner(self, value: AgentRunner) -> None:
        self.__dict__["_bootstrap_runner"] = value

    @property
    def loop(self) -> Any:
        return self.runtime_for().loop

    @loop.setter
    def loop(self, value: Any) -> None:
        self.__dict__["_bootstrap_loop"] = value

    @property
    def config(self) -> AppConfig:
        return self.runtime_for().config

    @config.setter
    def config(self, value: AppConfig) -> None:
        self.__dict__["_bootstrap_config"] = value

    @property
    def mcp(self) -> Any:
        return self.runtime_for().mcp

    @mcp.setter
    def mcp(self, value: Any) -> None:
        self.__dict__["_bootstrap_mcp"] = value

    @property
    def approvals(self) -> Any:
        return self.runtime_for().approvals

    @approvals.setter
    def approvals(self, value: Any) -> None:
        self.__dict__["_bootstrap_approvals"] = value

    @property
    def usage_budget(self) -> Any:
        return self.runtime_for().usage_budget

    @usage_budget.setter
    def usage_budget(self, value: Any) -> None:
        self.__dict__["_bootstrap_usage_budget"] = value

    @property
    def channels(self) -> ChannelManager | None:
        return self.runtime_for().channels

    @channels.setter
    def channels(self, value: ChannelManager | None) -> None:
        self.__dict__["_bootstrap_channels"] = value

    def is_mini_auth_enabled(self) -> bool:
        return self.settings.normalized_auth_provider() == "mini_auth"

    def rebuild_provider(self) -> None:
        # Platform keys stay in env; do not copy them into config.json.
        runtime = self.runtime_for()
        provider = build_provider_chain(runtime.config, stats=self.fallback_stats, fault=self.fault_controller)
        runtime.runner = AgentRunner(provider)
        runtime.loop.runner = runtime.runner

    def issue_token(self, ttl_s: int | None = None, account: dict[str, Any] | None = None) -> str:
        token = secrets.token_urlsafe(24)
        expires_in = self.settings.token_ttl_s if ttl_s is None else max(1, int(ttl_s))
        self.tokens[token] = TokenRecord(
            token=token,
            expires_at=time.time() + expires_in,
            account=account,
        )
        return token

    def revoke_token(self, token: str | None) -> None:
        if token:
            self.tokens.pop(token, None)

    def token_account(self, token: str | None) -> dict[str, Any] | None:
        if not token or not self.check_token(token):
            return None
        record = self.tokens.get(token)
        return record.account if record else None

    def begin_mini_auth_login(
        self,
        next_url: str,
        *,
        redirect_uri: str | None = None,
        desktop_login_id: str | None = None,
    ) -> tuple[str, str]:
        login_state = secrets.token_urlsafe(24)
        code_verifier = secrets.token_urlsafe(64)
        self.mini_auth_logins[login_state] = MiniAuthLoginRecord(
            code_verifier=code_verifier,
            next_url=next_url or "/",
            expires_at=time.time() + 600,
            redirect_uri=(redirect_uri or "").strip(),
            desktop_login_id=(desktop_login_id or "").strip(),
        )
        return login_state, code_verifier

    def consume_mini_auth_login(self, login_state: str) -> MiniAuthLoginRecord | None:
        record = self.mini_auth_logins.pop(login_state, None)
        if record is None:
            return None
        if record.expires_at < time.time():
            return None
        return record

    def put_desktop_handoff(
        self,
        desktop_login_id: str,
        *,
        token: str,
        ttl_s: int,
        next_url: str = "/",
    ) -> None:
        key = (desktop_login_id or "").strip()
        if not key:
            return
        self.desktop_handoffs[key] = DesktopHandoffRecord(
            token=token,
            expires_at=time.time() + max(1, int(ttl_s)),
            next_url=next_url or "/",
        )

    def take_desktop_handoff(self, desktop_login_id: str) -> DesktopHandoffRecord | None:
        key = (desktop_login_id or "").strip()
        if not key:
            return None
        record = self.desktop_handoffs.pop(key, None)
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
        self.runtime_for().save_config()
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
    migrate_legacy_user_data(settings)
    sandbox_backend = build_sandbox_backend(settings)
    fallback_stats = FallbackStats()
    fault_controller = FaultController()
    from minibot.webui.media_gateway import WebUIMediaGateway

    media_gateway = WebUIMediaGateway(
        logger=logging.getLogger("minibot.webui.media"),
        secret=secrets.token_bytes(32),
    )
    state = AppState(
        settings=settings,
        bus=MessageBus(),
        sessions=None,
        tools=None,
        runner=None,  # type: ignore[arg-type]
        loop=None,
        config=None,  # type: ignore[arg-type]
        mcp=None,
        approvals=None,
        fallback_stats=fallback_stats,
        fault_controller=fault_controller,
        sandbox_backend=sandbox_backend,
        media_gateway=media_gateway,
    )
    state.bus_worker = BusWorker(state)
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

        owner_user_id = state.find_session_owner(job.session_id)
        if owner_user_id is None:
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
                user_id=owner_user_id,
            )
        )
        await asyncio.wait_for(waiter, timeout=600.0)

    state.cron = CronService(cron_path, on_job=_on_cron_job)
    return state
