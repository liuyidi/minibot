"""Skills loader: builtin package skills + workspace/skills."""

from __future__ import annotations

import json
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

BUILTIN_SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"
_SKILL_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
# Cursor-style `/skill-name` at start of message or after whitespace (not URL paths).
_SLASH_SKILL_RE = re.compile(r"(?:^|(?<=\s))/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\b")
# Builtin control commands that must not be treated as skills.
RESERVED_SLASH_COMMAND_NAMES = frozenset({
    "stop",
    "restart",
    "new",
    "history",
    "model",
    "goal",
    "help",
    "clear",
    "compact",
    "status",
    "skills",
})


@dataclass(frozen=True)
class SkillInfo:
    name: str
    description: str
    always: bool
    source: str  # builtin | workspace
    path: str
    body: str
    raw_markdown: str
    requires_bins: tuple[str, ...]
    requires_env: tuple[str, ...]


def _as_str_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _parse_nanobot_metadata(raw: object) -> dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return {}
    if not isinstance(raw, dict):
        return {}
    payload = raw.get("nanobot", raw.get("openclaw", {}))
    return payload if isinstance(payload, dict) else {}


def _extract_requires(meta: dict[str, Any]) -> tuple[tuple[str, ...], tuple[str, ...]]:
    requires = meta.get("requires")
    if not isinstance(requires, dict):
        nested = _parse_nanobot_metadata(meta.get("metadata")).get("requires")
        requires = nested if isinstance(nested, dict) else {}
    bins = _as_str_list(requires.get("bins") if isinstance(requires, dict) else None)
    env = _as_str_list(requires.get("env") if isinstance(requires, dict) else None)
    return tuple(bins), tuple(env)


def _parse_skill_markdown(raw: str, *, source: str, name: str) -> SkillInfo | None:
    meta: dict[str, Any] = {}
    body = raw
    raw_markdown = raw
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            try:
                parsed = yaml.safe_load(parts[1])
            except yaml.YAMLError:
                parsed = None
            if isinstance(parsed, dict):
                meta = parsed
            body = parts[2].lstrip("\n")
    always_raw = meta.get("always", False)
    if isinstance(always_raw, str):
        always = always_raw.lower() in {"true", "yes", "1"}
    else:
        always = bool(always_raw)
    bins, env = _extract_requires(meta)
    return SkillInfo(
        name=str(meta.get("name") or name),
        description=str(meta.get("description") or "").strip(),
        always=always,
        source=source,
        path="",  # filled by caller
        body=body.strip(),
        raw_markdown=raw_markdown,
        requires_bins=bins,
        requires_env=env,
    )


def _load_skill_file(path: Path, *, source: str, name: str) -> SkillInfo | None:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return None
    info = _parse_skill_markdown(raw, source=source, name=name)
    if info is None:
        return None
    return SkillInfo(
        name=info.name,
        description=info.description,
        always=info.always,
        source=info.source,
        path=str(path),
        body=info.body,
        raw_markdown=info.raw_markdown,
        requires_bins=info.requires_bins,
        requires_env=info.requires_env,
    )


class SkillsRegistry:
    """Discover and format skills for prompts / API."""

    def __init__(
        self,
        workspace: Path | str | None = None,
        *,
        builtin_dir: Path | None = None,
    ) -> None:
        self.workspace = Path(workspace).expanduser() if workspace else None
        self.builtin_dir = builtin_dir or BUILTIN_SKILLS_DIR

    def list_skills(self) -> list[SkillInfo]:
        by_name: dict[str, SkillInfo] = {}
        if self.builtin_dir.is_dir():
            for skill_dir in sorted(self.builtin_dir.iterdir()):
                path = skill_dir / "SKILL.md"
                if skill_dir.is_dir() and path.is_file():
                    info = _load_skill_file(path, source="builtin", name=skill_dir.name)
                    if info:
                        by_name[info.name] = info
        if self.workspace is not None:
            ws_skills = self.workspace / "skills"
            if ws_skills.is_dir():
                for skill_dir in sorted(ws_skills.iterdir()):
                    path = skill_dir / "SKILL.md"
                    if skill_dir.is_dir() and path.is_file():
                        info = _load_skill_file(path, source="workspace", name=skill_dir.name)
                        if info:
                            by_name[info.name] = info
        return sorted(by_name.values(), key=lambda s: s.name)

    def get(self, name: str) -> SkillInfo | None:
        return next((s for s in self.list_skills() if s.name == name), None)

    def requirements(self, skill: SkillInfo) -> dict[str, list[str]]:
        missing_bins = [b for b in skill.requires_bins if not shutil.which(b)]
        missing_env = [e for e in skill.requires_env if not os.environ.get(e)]
        return {
            "bins": list(skill.requires_bins),
            "env": list(skill.requires_env),
            "missing_bins": missing_bins,
            "missing_env": missing_env,
        }

    def is_available(self, skill: SkillInfo) -> bool:
        req = self.requirements(skill)
        return not req["missing_bins"] and not req["missing_env"]

    def unavailable_reason(self, skill: SkillInfo) -> str:
        req = self.requirements(skill)
        parts = [f"CLI: {name}" for name in req["missing_bins"]] + [
            f"ENV: {name}" for name in req["missing_env"]
        ]
        return ", ".join(parts)

    def always_skills(self) -> list[SkillInfo]:
        return [s for s in self.list_skills() if s.always and self.is_available(s)]

    def build_skills_summary(self, *, exclude: set[str] | None = None) -> str:
        skip = exclude or set()
        lines: list[str] = []
        for skill in self.list_skills():
            if skill.name in skip or not self.is_available(skill):
                continue
            desc = skill.description or "(no description)"
            lines.append(f"- **{skill.name}** ({skill.source}): {desc}")
        return "\n".join(lines)

    def get_explicitly_invoked_skills(self, text: str) -> list[str]:
        """Resolve ``/skill-name`` references to available skills."""
        if not text:
            return []
        available = {
            skill.name
            for skill in self.list_skills()
            if self.is_available(skill)
        }
        invoked: list[str] = []
        for match in _SLASH_SKILL_RE.finditer(text):
            name = match.group(1)
            key = name.lower()
            if key in RESERVED_SLASH_COMMAND_NAMES:
                continue
            # Match catalog names case-insensitively but preserve canonical casing.
            canonical = next((n for n in available if n.lower() == key), None)
            if canonical is None or canonical in invoked:
                continue
            invoked.append(canonical)
        return invoked

    def load_skills_for_context(self, skill_names: list[str]) -> str:
        """Load specific skills for inclusion in agent context."""
        by_name = {skill.name: skill for skill in self.list_skills()}
        parts: list[str] = []
        for name in skill_names:
            skill = by_name.get(name)
            if skill is None or not skill.body or not self.is_available(skill):
                continue
            parts.append(f"### Skill: {skill.name}\n\n{skill.body}")
        return "\n\n---\n\n".join(parts)

    def load_always_bodies(self) -> str:
        return self.load_skills_for_context([s.name for s in self.always_skills()])

    def webui_summary(self, skill: SkillInfo) -> dict[str, Any]:
        available = self.is_available(skill)
        item: dict[str, Any] = {
            "name": skill.name,
            "description": skill.description,
            "source": skill.source,
            "available": available,
        }
        if not available:
            item["unavailable_reason"] = self.unavailable_reason(skill)
        return item

    def webui_detail(self, skill: SkillInfo) -> dict[str, Any]:
        return {
            **self.webui_summary(skill),
            "requirements": self.requirements(skill),
            "raw_markdown": skill.raw_markdown,
        }

    def webui_list_payload(self) -> dict[str, Any]:
        return {"skills": [self.webui_summary(s) for s in self.list_skills()]}

    def install_skill(self, markdown: str, *, name: str | None = None) -> SkillInfo:
        """Write a workspace SKILL.md from markdown (creates or overwrites)."""
        if self.workspace is None:
            raise ValueError("workspace is required to install skills")
        text = (markdown or "").strip()
        if not text:
            raise ValueError("markdown is required")
        parsed = _parse_skill_markdown(text, source="workspace", name=name or "skill")
        if parsed is None:
            raise ValueError("invalid skill markdown")
        skill_name = (name or parsed.name or "").strip()
        if not _SKILL_NAME_RE.match(skill_name):
            raise ValueError(
                "skill name must be alphanumeric (plus - _), max 64 chars"
            )
        target_dir = self.workspace / "skills" / skill_name
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / "SKILL.md"
        # Prefer caller markdown so frontmatter stays intact.
        target.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
        loaded = _load_skill_file(target, source="workspace", name=skill_name)
        if loaded is None:
            raise ValueError("failed to load installed skill")
        return loaded

    def api_payload(self, *, include_body: bool = False, body_limit: int = 12_000) -> dict[str, Any]:
        """Dev-oriented payload (paths, always flags). Prefer webui_* for product UI."""
        skills = self.list_skills()
        items: list[dict[str, Any]] = []
        for s in skills:
            item: dict[str, Any] = {
                "name": s.name,
                "description": s.description,
                "always": s.always,
                "source": s.source,
                "path": s.path,
                "body_chars": len(s.body),
                "available": self.is_available(s),
            }
            reason = self.unavailable_reason(s)
            if reason:
                item["unavailable_reason"] = reason
            if include_body:
                body = s.body
                if len(body) > body_limit:
                    body = body[:body_limit] + "\n…(truncated)"
                item["body"] = body
            items.append(item)
        return {
            "skills": items,
            "installed_count": len(skills),
            "always_count": sum(1 for s in skills if s.always),
            "builtin_dir": str(self.builtin_dir),
            "workspace_skills_dir": (
                str(self.workspace / "skills") if self.workspace is not None else None
            ),
        }
