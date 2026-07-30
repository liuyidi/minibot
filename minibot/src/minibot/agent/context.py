"""Context assembly: identity + workspace bootstrap + memory + skills + summary."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from minibot.agent.memory import read_memory
from minibot.agent.skills import SkillsRegistry

BOOTSTRAP_FILES = ("AGENTS.md", "SOUL.md", "USER.md")

_FLAG_KEYS = {
    "AGENTS.md": "agents",
    "SOUL.md": "soul",
    "USER.md": "user",
}


@dataclass(frozen=True)
class BuiltSystemPrompt:
    text: str
    flags: dict[str, bool]
    missing_bootstrap: list[str]
    loaded_bootstrap: list[str]
    has_summary: bool
    memory_chars: int = 0
    skills_count: int = 0

    def to_trace_meta(self, workspace: Path | str | None = None) -> dict[str, Any]:
        """Compact injection snapshot for Agent Trace (prepare / llm_request)."""
        mem_preview = ""
        mem_path = None
        if workspace is not None:
            snap = read_memory(workspace)
            mem_path = snap.path
            if snap.text:
                mem_preview = snap.text if len(snap.text) <= 240 else snap.text[:240] + "…"
        registry = SkillsRegistry(workspace)
        skills = registry.list_skills()
        always = [s.name for s in skills if s.always]
        catalog = [
            {"name": s.name, "source": s.source, "always": s.always}
            for s in skills
        ]
        return {
            "memory": {
                "injected": bool(self.flags.get("memory")),
                "chars": self.memory_chars,
                "path": mem_path,
                "preview": mem_preview,
            },
            "skills": {
                "count": self.skills_count,
                "always": always,
                "always_injected": bool(always),
                "items": catalog,
            },
            "bootstrap": {
                "loaded": list(self.loaded_bootstrap),
                "missing": list(self.missing_bootstrap),
                "flags": {
                    k: bool(self.flags.get(k))
                    for k in ("agents", "soul", "user")
                },
            },
            "system_chars": len(self.text),
            "has_summary": self.has_summary,
        }


def _read_text(path: Path, *, limit: int = 12_000) -> str | None:
    if not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    text = text.strip()
    if not text:
        return None
    if len(text) > limit:
        return text[:limit] + "\n…(truncated)"
    return text


def load_bootstrap(workspace: Path | str) -> dict[str, str]:
    root = Path(workspace)
    out: dict[str, str] = {}
    for name in BOOTSTRAP_FILES:
        content = _read_text(root / name)
        if content:
            out[name] = content
    return out


def build_system_prompt(
    *,
    workspace: Path | str | None,
    identity: str,
    session_summary: str = "",
) -> BuiltSystemPrompt:
    """Assemble system prompt for a turn."""
    parts: list[str] = [identity.strip()]
    flags = {k: False for k in ("agents", "soul", "user", "memory")}
    loaded: list[str] = []
    missing: list[str] = list(BOOTSTRAP_FILES)
    memory_chars = 0
    skills_count = 0

    if workspace is not None:
        bootstrap = load_bootstrap(workspace)
        missing = [n for n in BOOTSTRAP_FILES if n not in bootstrap]
        for name, content in bootstrap.items():
            key = _FLAG_KEYS[name]
            flags[key] = True
            loaded.append(name)
            parts.append(f"# {name}\n\n{content}")

        mem = read_memory(workspace)
        memory_chars = mem.chars
        if mem.exists and mem.text:
            flags["memory"] = True
            parts.append(f"# Memory\n\n{mem.text}")

        registry = SkillsRegistry(workspace)
        skills = registry.list_skills()
        skills_count = len(skills)
        always = registry.always_skills()
        always_body = registry.load_always_bodies()
        if always_body:
            parts.append(f"# Active Skills\n\n{always_body}")
        catalog = registry.build_skills_summary(exclude={s.name for s in always})
        if catalog:
            parts.append(
                "# Skills\n\n"
                "These skills may apply. Follow a skill's guidance when the task matches.\n\n"
                f"{catalog}"
            )

    summary = (session_summary or "").strip()
    if summary:
        parts.append(f"[Archived Context Summary]\n\n{summary}")

    return BuiltSystemPrompt(
        text="\n\n---\n\n".join(parts),
        flags=flags,
        missing_bootstrap=missing,
        loaded_bootstrap=loaded,
        has_summary=bool(summary),
        memory_chars=memory_chars,
        skills_count=skills_count,
    )


def build_turn_messages(
    *,
    history: list[dict[str, Any]],
    user_content: str,
    system: str,
) -> list[dict[str, Any]]:
    """Messages passed to AgentRunner for one turn (system is applied by runner)."""
    # Runner accepts system= kw; history + user only here for clarity.
    _ = system
    return [*history, {"role": "user", "content": user_content}]


def inspect_context(
    *,
    workspace: Path | str | None,
    identity: str,
    session_summary: str = "",
    message_count: int = 0,
) -> dict[str, Any]:
    built = build_system_prompt(
        workspace=workspace,
        identity=identity,
        session_summary=session_summary,
    )
    preview = built.text if len(built.text) <= 1200 else built.text[:1200] + "…"
    mem = read_memory(workspace) if workspace is not None else None
    skills = SkillsRegistry(workspace).api_payload() if workspace is not None else {
        "skills": [],
        "installed_count": 0,
    }
    return {
        "system_preview": preview,
        "system_chars": len(built.text),
        "flags": built.flags,
        "loaded_bootstrap": built.loaded_bootstrap,
        "missing_bootstrap": built.missing_bootstrap,
        "has_summary": built.has_summary,
        "summary_preview": (session_summary or "")[:400],
        "message_count": message_count,
        "workspace_path": str(workspace) if workspace else None,
        "memory": {
            "exists": bool(mem and mem.exists and mem.text),
            "path": mem.path if mem else None,
            "chars": mem.chars if mem else 0,
            "preview": (mem.text[:800] if mem and mem.text else ""),
        },
        "skills": skills["skills"],
        "skills_count": skills["installed_count"],
        "memory_chars": built.memory_chars,
    }


def messages_to_compact_blob(messages: list[dict[str, Any]], *, limit: int = 40_000) -> str:
    lines: list[str] = []
    for msg in messages:
        role = msg.get("role") or "?"
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            lines.append(f"{role}: {content.strip()}")
        elif msg.get("tool_calls"):
            names = []
            for tc in msg["tool_calls"]:
                fn = tc.get("function") or {}
                names.append(str(fn.get("name") or tc.get("name") or "tool"))
            lines.append(f"{role}: [tool_calls: {', '.join(names)}]")
    blob = "\n".join(lines)
    if len(blob) > limit:
        return blob[:limit] + "\n…(truncated)"
    return blob
