"""Skills WebUI closed loop: available + detail + prompt filter."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from minibot.agent.context import build_system_prompt
from minibot.agent.skills import SkillsRegistry
from minibot.agent.tools.builtin import SYSTEM_PROMPT


def _write_skill(
    root: Path,
    name: str,
    *,
    frontmatter: str,
    body: str = "# Body\n",
) -> Path:
    skill_dir = root / "skills" / name
    skill_dir.mkdir(parents=True)
    path = skill_dir / "SKILL.md"
    path.write_text(f"---\n{frontmatter}\n---\n\n{body}", encoding="utf-8")
    return path


def test_skill_without_requires_is_available(tmp_path: Path) -> None:
    _write_skill(
        tmp_path,
        "plain",
        frontmatter="name: plain\ndescription: No deps.\n",
    )
    reg = SkillsRegistry(tmp_path, builtin_dir=tmp_path / "no-builtin")
    skill = next(s for s in reg.list_skills() if s.name == "plain")
    assert reg.is_available(skill) is True
    assert reg.unavailable_reason(skill) == ""
    summary = reg.webui_summary(skill)
    assert summary["available"] is True
    assert "unavailable_reason" not in summary or not summary.get("unavailable_reason")


def test_skill_missing_bin_is_unavailable(tmp_path: Path) -> None:
    _write_skill(
        tmp_path,
        "needs-cli",
        frontmatter=(
            "name: needs-cli\n"
            "description: Needs a fake CLI.\n"
            "requires:\n"
            "  bins:\n"
            "    - definitely-not-a-real-cli-xyz\n"
        ),
    )
    reg = SkillsRegistry(tmp_path, builtin_dir=tmp_path / "no-builtin")
    skill = next(s for s in reg.list_skills() if s.name == "needs-cli")
    assert reg.is_available(skill) is False
    assert "CLI: definitely-not-a-real-cli-xyz" in reg.unavailable_reason(skill)
    req = reg.requirements(skill)
    assert "definitely-not-a-real-cli-xyz" in req["bins"]
    assert "definitely-not-a-real-cli-xyz" in req["missing_bins"]


def test_skill_minibot_metadata_requires_env(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("MINIBOT_TEST_SKILL_TOKEN", raising=False)
    _write_skill(
        tmp_path,
        "needs-env",
        frontmatter=(
            "name: needs-env\n"
            "description: Needs env.\n"
            'metadata: {"minibot":{"requires":{"env":["MINIBOT_TEST_SKILL_TOKEN"]}}}\n'
        ),
    )
    reg = SkillsRegistry(tmp_path, builtin_dir=tmp_path / "no-builtin")
    skill = next(s for s in reg.list_skills() if s.name == "needs-env")
    assert reg.is_available(skill) is False
    assert "ENV: MINIBOT_TEST_SKILL_TOKEN" in reg.unavailable_reason(skill)


def test_always_and_catalog_omit_unavailable(tmp_path: Path) -> None:
    _write_skill(
        tmp_path,
        "always-ok",
        frontmatter="name: always-ok\ndescription: Always ok.\nalways: true\n",
        body="# Always OK\n",
    )
    _write_skill(
        tmp_path,
        "always-bad",
        frontmatter=(
            "name: always-bad\n"
            "description: Always but missing bin.\n"
            "always: true\n"
            "requires:\n"
            "  bins:\n"
            "    - definitely-not-a-real-cli-xyz\n"
        ),
        body="# Always BAD\n",
    )
    _write_skill(
        tmp_path,
        "catalog-bad",
        frontmatter=(
            "name: catalog-bad\n"
            "description: Catalog missing bin.\n"
            "requires:\n"
            "  bins:\n"
            "    - definitely-not-a-real-cli-xyz\n"
        ),
    )
    reg = SkillsRegistry(tmp_path, builtin_dir=tmp_path / "no-builtin")
    always = reg.always_skills()
    always_names = {s.name for s in always}
    assert always_names == {"always-ok"}
    body = reg.load_always_bodies()
    assert "Always OK" in body
    assert "Always BAD" not in body
    catalog = reg.build_skills_summary(exclude={s.name for s in always})
    assert "always-ok" not in catalog
    assert "catalog-bad" not in catalog
    catalog_all = reg.build_skills_summary(exclude=set())
    assert "always-ok" in catalog_all
    assert "catalog-bad" not in catalog_all


def test_prompt_omits_unavailable_always(tmp_path: Path) -> None:
    _write_skill(
        tmp_path,
        "always-bad",
        frontmatter=(
            "name: always-bad\n"
            "description: bad\n"
            "always: true\n"
            "requires:\n"
            "  bins:\n"
            "    - definitely-not-a-real-cli-xyz\n"
        ),
        body="# SECRET_UNAVAILABLE_SKILL\n",
    )
    built = build_system_prompt(workspace=tmp_path, identity=SYSTEM_PROMPT)
    assert "SECRET_UNAVAILABLE_SKILL" not in built.text


def test_webui_skills_list_has_available(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    resp = client.get("/api/webui/skills", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "skills" in data
    assert data["skills"], "expected at least builtin skills"
    for skill in data["skills"]:
        assert "name" in skill
        assert "description" in skill
        assert "source" in skill
        assert isinstance(skill["available"], bool)


def test_webui_skill_detail_ok(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    resp = client.get("/api/webui/skills/memory", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "memory"
    assert isinstance(data["available"], bool)
    assert "requirements" in data
    for key in ("bins", "env", "missing_bins", "missing_env"):
        assert key in data["requirements"]
        assert isinstance(data["requirements"][key], list)
    assert "raw_markdown" in data
    assert "---" in data["raw_markdown"] or "# " in data["raw_markdown"]


def test_webui_skill_detail_404(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    resp = client.get("/api/webui/skills/no-such-skill-zzz", headers=auth_headers)
    assert resp.status_code == 404


def test_webui_summary_payload_shape(tmp_path: Path) -> None:
    _write_skill(
        tmp_path,
        "plain",
        frontmatter="name: plain\ndescription: Hello.\n",
    )
    reg = SkillsRegistry(tmp_path, builtin_dir=tmp_path / "no-builtin")
    payload = reg.webui_list_payload()
    assert set(payload.keys()) == {"skills"}
    assert payload["skills"][0]["name"] == "plain"
    assert payload["skills"][0]["description"] == "Hello."
    assert payload["skills"][0]["available"] is True


def test_install_skill_writes_workspace_skill(tmp_path: Path) -> None:
    reg = SkillsRegistry(tmp_path, builtin_dir=tmp_path / "no-builtin")
    info = reg.install_skill(
        "---\nname: my-note\ndescription: A note skill.\n---\n\n# Hello\n",
    )
    assert info.name == "my-note"
    assert info.source == "workspace"
    path = tmp_path / "skills" / "my-note" / "SKILL.md"
    assert path.is_file()
    assert "Hello" in path.read_text(encoding="utf-8")


def test_webui_install_skill_api(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path, monkeypatch
) -> None:
    from minibot.api.routes import misc as misc_routes

    monkeypatch.setattr(misc_routes, "_webui_skills_workspace", lambda _state: tmp_path)
    resp = client.post(
        "/api/webui/skills",
        headers=auth_headers,
        json={
            "markdown": "---\nname: uploaded\ndescription: From API.\n---\n\n# Uploaded\n",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "uploaded"
    assert data["source"] == "workspace"
    assert data["available"] is True
    assert (tmp_path / "skills" / "uploaded" / "SKILL.md").is_file()
