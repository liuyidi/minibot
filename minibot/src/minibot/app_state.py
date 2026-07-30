"""Shared application state."""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path

from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.builtin import SYSTEM_PROMPT, register_default_tools
from minibot.agent.tools.mcp import McpManager
from minibot.agent.tools.registry import ToolRegistry
from minibot.bus.queue import MessageBus
from minibot.bus.worker import BusWorker
from minibot.config.app_config import AppConfig, load_app_config, save_app_config
from minibot.config.settings import Settings, get_settings
from minibot.cron.service import CronService
from minibot.cron.types import CronJob
from minibot.providers.openai_compat import OpenAICompatProvider
from minibot.session.store import SessionStore


@dataclass
class TokenRecord:
    token: str
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
    cron: CronService | None = None
    bus_worker: BusWorker | None = None
    tokens: dict[str, TokenRecord] = field(default_factory=dict)

    def rebuild_provider(self) -> None:
        provider = OpenAICompatProvider(
            api_key=self.config.openai_api_key or self.settings.resolved_api_key(),
            base_url=self.config.openai_base_url,
        )
        self.runner = AgentRunner(provider)
        self.loop.runner = self.runner

    def issue_token(self) -> str:
        token = secrets.token_urlsafe(24)
        self.tokens[token] = TokenRecord(
            token=token,
            expires_at=time.time() + self.settings.token_ttl_s,
        )
        return token

    def check_token(self, token: str | None) -> bool:
        if not self.settings.require_auth and not self.settings.auth_secret:
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
    if not config.openai_api_key:
        config.openai_api_key = settings.resolved_api_key()
    tools = register_default_tools()
    mcp = McpManager(tools)
    provider = OpenAICompatProvider(
        api_key=config.openai_api_key,
        base_url=config.openai_base_url,
    )
    runner = AgentRunner(provider)
    sessions = SessionStore(data_dir=settings.data_dir)
    loop = AgentLoop(
        sessions=sessions,
        tools=tools,
        runner=runner,
        config=config,
        system_prompt=SYSTEM_PROMPT,
    )
    from minibot.agent.tools.spawn import attach_spawn_tool

    attach_spawn_tool(tools, loop=loop)
    state = AppState(
        settings=settings,
        bus=MessageBus(),
        sessions=sessions,
        tools=tools,
        runner=runner,
        loop=loop,
        config=config,
        mcp=mcp,
    )
    state.bus_worker = BusWorker(state)
    cron_path = settings.data_dir.expanduser() / "cron" / "jobs.json"

    async def _on_cron_job(job: CronJob) -> None:
        from minibot.bus.events import InboundMessage

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