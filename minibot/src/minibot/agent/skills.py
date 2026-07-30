"""Skills loader: builtin package skills + workspace/skills."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

BUILTIN_SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"

_FRONTMATTER = re.compile(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n?", re.DOTALL)


@dataclass(frozen=True)
class SkillInfo:
    name: str
    description: str
    always: bool
    source: str  # builtin | workspace
    path: str
    body: str


def _parse_frontmatter(raw: str) -> tuple[dict[str, Any], str]:
    match = _FRONTMATTER.match(raw)
    if not match:
        return {}, raw
    meta: dict[str, Any] = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip().strip("\"'")
        if key == "always":
            meta[key] = value.lower() in {"true", "yes", "1"}
        else:
            meta[key] = value
    body = raw[match.end() :]
    return meta, body


def _load_skill_file(path: Path, *, source: str, name: str) -> SkillInfo | None:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return None
    meta, body = _parse_frontmatter(raw)
    return SkillInfo(
        name=str(meta.get("name") or name),
        description=str(meta.get("description") or "").strip(),
        always=bool(meta.get("always", False)),
        source=source,
        path=str(path),
        body=body.strip(),
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
        # Builtin first; workspace overrides same name.
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

    def always_skills(self) -> list[SkillInfo]:
        return [s for s in self.list_skills() if s.always]

    def build_skills_summary(self, *, exclude: set[str] | None = None) -> str:
        skip = exclude or set()
        lines: list[str] = []
        for skill in self.list_skills():
            if skill.name in skip:
                continue
            desc = skill.description or "(no description)"
            lines.append(f"- **{skill.name}** ({skill.source}): {desc}")
        return "\n".join(lines)

    def load_always_bodies(self) -> str:
        parts = [
            f"### Skill: {s.name}\n\n{s.body}"
            for s in self.always_skills()
            if s.body
        ]
        return "\n\n---\n\n".join(parts)

    def api_payload(self, *, include_body: bool = False, body_limit: int = 12_000) -> dict[str, Any]:
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
            }
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
