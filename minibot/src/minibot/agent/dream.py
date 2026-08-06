"""Thin Dream MVP: consolidate recent session excerpts into MEMORY.md."""

from __future__ import annotations

import logging
from pathlib import Path

from minibot.agent.loop import AgentLoop
from minibot.agent.memory import read_memory
from minibot.session.store import SessionStore
from minibot.workspace import default_workspace

logger = logging.getLogger(__name__)

_SYSTEM_SESSION_IDS = frozenset({"heartbeat", "dream"})
_MAX_SESSIONS = 5
_MAX_MSGS_PER_SESSION = 8
_MAX_CHARS = 12_000


def _session_excerpts(sessions: SessionStore) -> str:
    parts: list[str] = []
    total = 0
    for session in sessions.list():
        if session.id in _SYSTEM_SESSION_IDS:
            continue
        if len(parts) >= _MAX_SESSIONS:
            break
        lines: list[str] = [f"### session `{session.id}`"]
        msgs = session.messages[-_MAX_MSGS_PER_SESSION:]
        for msg in msgs:
            role = str(msg.get("role") or "")
            if role not in {"user", "assistant"}:
                continue
            content = msg.get("content")
            if not isinstance(content, str) or not content.strip():
                continue
            snippet = content.strip()
            if len(snippet) > 800:
                snippet = snippet[:800] + "…"
            lines.append(f"- **{role}**: {snippet}")
        if len(lines) <= 1:
            continue
        block = "\n".join(lines)
        if total + len(block) > _MAX_CHARS:
            break
        parts.append(block)
        total += len(block)
    return "\n\n".join(parts)


async def run_dream(
    *,
    loop: AgentLoop,
    sessions: SessionStore,
    workspace: Path | None = None,
) -> str | None:
    """Run one thin Dream consolidation turn. Returns assistant content or None."""
    ws = Path(workspace) if workspace is not None else default_workspace()
    excerpts = _session_excerpts(sessions)
    if not excerpts.strip():
        logger.info("Dream: nothing to process")
        return None

    existing = read_memory(ws).text
    mem_block = existing[:4_000] if existing else "(empty)"
    prompt = (
        "You are running a Dream memory consolidation pass.\n"
        "Read the recent chat excerpts and the current MEMORY.md.\n"
        "Use the write_memory tool (mode=replace) to update MEMORY.md with a concise, "
        "durable set of facts about the user and workspace. Merge duplicates; drop "
        "ephemeral chatter. Prefer bullet lists.\n\n"
        f"## Current MEMORY.md\n{mem_block}\n\n"
        f"## Recent chat excerpts\n{excerpts}\n"
    )
    sessions.create(session_id="dream", title="Dream", workspace=ws)
    result = await loop.handle_turn(
        "dream",
        prompt,
        workspace=ws,
        entry="dream",
        stream=False,
        bus=None,
        channel="system",
    )
    # Keep dream session bounded.
    session = sessions.get("dream")
    if session is not None and len(session.messages) > 12:
        sessions.replace_messages("dream", session.messages[-12:])
    logger.info("Dream: consolidation turn finished (%s chars)", len(result.content or ""))
    return result.content or None
