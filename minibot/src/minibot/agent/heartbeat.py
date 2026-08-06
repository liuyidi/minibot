"""Heartbeat system job helpers."""

from __future__ import annotations

import logging
from pathlib import Path

from minibot.agent.loop import AgentLoop
from minibot.bus.events import OutboundMessage
from minibot.bus.queue import MessageBus
from minibot.config.app_config import AppConfig
from minibot.session.store import SessionStore
from minibot.utils.evaluator import evaluate_response
from minibot.workspace import default_workspace, seed_workspace_bootstrap

logger = logging.getLogger(__name__)

_HEARTBEAT_PREAMBLE = (
    "You are executing periodic heartbeat tasks. Read the active tasks below, "
    "perform each one, and report what you did. Do not narrate configuration "
    "files or whether you will notify the user.\n\n"
)

_SYSTEM_SESSION_IDS = frozenset({"heartbeat", "dream"})


def heartbeat_has_active_tasks(content: str) -> bool:
    """True if HEARTBEAT.md has task lines under ## Active Tasks."""
    in_comment = False
    in_active_section = False
    for line in content.splitlines():
        stripped = line.strip()
        if in_comment:
            if "-->" in stripped:
                in_comment = False
            continue
        if not stripped or stripped.startswith("#"):
            if stripped.startswith("##") and not stripped.startswith("###"):
                heading = stripped.lstrip("#").strip().lower()
                in_active_section = heading.startswith("active tasks")
            continue
        if stripped.startswith("<!--"):
            if "-->" not in stripped[4:]:
                in_comment = True
            continue
        if not in_active_section:
            continue
        return True
    return False


def pick_heartbeat_target(sessions: SessionStore) -> tuple[str, str] | None:
    """Return (channel, chat_id) for the most recently active non-system session."""
    for session in sessions.list():
        sid = session.id
        if sid in _SYSTEM_SESSION_IDS:
            continue
        if ":" in sid:
            channel, chat_id = sid.split(":", 1)
            if channel in {"cli", "system", "cron"}:
                continue
            if chat_id:
                return channel, chat_id
            continue
        return "websocket", sid
    return None


async def run_heartbeat(
    *,
    loop: AgentLoop,
    sessions: SessionStore,
    bus: MessageBus,
    config: AppConfig,
    workspace: Path | None = None,
) -> str | None:
    """Run one heartbeat cycle. Returns delivered content or None when silenced/skipped."""
    ws = Path(workspace) if workspace is not None else default_workspace()
    seed_workspace_bootstrap(ws)
    path = ws / "HEARTBEAT.md"
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        logger.debug("Heartbeat: HEARTBEAT.md missing at %s", path)
        return None
    if not heartbeat_has_active_tasks(content):
        logger.debug("Heartbeat: no active tasks")
        return None

    target = pick_heartbeat_target(sessions)
    if target is None:
        logger.debug("Heartbeat: no delivery target session")
        return None
    channel, chat_id = target

    sessions.create(session_id="heartbeat", title="Heartbeat", workspace=ws)
    prompt = _HEARTBEAT_PREAMBLE + content
    result = await loop.handle_turn(
        "heartbeat",
        prompt,
        workspace=ws,
        entry="heartbeat",
        stream=False,
        bus=None,
        channel=channel,
    )

    keep = max(2, int(config.heartbeat.keep_recent_messages or 8))
    session = sessions.get("heartbeat")
    if session is not None and len(session.messages) > keep:
        sessions.replace_messages("heartbeat", session.messages[-keep:])

    response = (result.content or "").strip()
    if not response:
        return None

    model = (config.model or "").strip() or "gpt-4o-mini"
    should_notify = await evaluate_response(
        response,
        prompt,
        loop.runner.provider,
        model,
        default_notify=False,
    )
    if not should_notify:
        logger.info("Heartbeat: silenced by evaluator")
        return None

    await bus.publish_outbound(
        OutboundMessage(channel=channel, chat_id=chat_id, content=response)
    )
    logger.info("Heartbeat: delivered to %s:%s", channel, chat_id)
    return response
