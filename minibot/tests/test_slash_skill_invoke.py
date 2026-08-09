"""Explicit `/skill-name` invocation injects skill bodies into the system prompt."""

from __future__ import annotations

from pathlib import Path

from minibot.agent.context import build_system_prompt
from minibot.agent.skills import SkillsRegistry
from minibot.agent.tools.builtin import SYSTEM_PROMPT


def _write_skill(root: Path, name: str, body: str, *, description: str = "") -> None:
    skill_dir = root / "skills" / name
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: {description or name}\n---\n\n{body}\n",
        encoding="utf-8",
    )


def test_get_explicitly_invoked_skills_parses_slash_tokens(tmp_path: Path) -> None:
    _write_skill(tmp_path, "skill-creator", "CREATE_BODY")
    _write_skill(tmp_path, "summarize", "SUM_BODY")
    reg = SkillsRegistry(tmp_path, builtin_dir=tmp_path / "no-builtin")

    assert reg.get_explicitly_invoked_skills("/skill-creator help me") == ["skill-creator"]
    assert reg.get_explicitly_invoked_skills("please /summarize this and /skill-creator") == [
        "summarize",
        "skill-creator",
    ]
    assert reg.get_explicitly_invoked_skills("see https://example.com/skill-creator") == []
    assert reg.get_explicitly_invoked_skills("/stop now") == []
    assert reg.get_explicitly_invoked_skills("/missing-skill") == []


def test_build_system_prompt_injects_slash_invoked_skill(tmp_path: Path) -> None:
    _write_skill(tmp_path, "skill-creator", "INVOKE_MARKER_XYZ", description="Create skills")
    built = build_system_prompt(
        workspace=tmp_path,
        identity=SYSTEM_PROMPT,
        user_message="/skill-creator draft a skill",
    )
    assert "# Active Skills" in built.text
    assert "INVOKE_MARKER_XYZ" in built.text
    assert "### Skill: skill-creator" in built.text


def test_build_system_prompt_without_slash_skill_skips_body(tmp_path: Path) -> None:
    _write_skill(tmp_path, "skill-creator", "INVOKE_MARKER_XYZ")
    built = build_system_prompt(
        workspace=tmp_path,
        identity=SYSTEM_PROMPT,
        user_message="hello without slash",
    )
    assert "INVOKE_MARKER_XYZ" not in built.text
