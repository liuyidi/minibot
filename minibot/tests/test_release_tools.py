from __future__ import annotations

import json
from pathlib import Path

import pytest

from minibot.release_tools import (
    check_release_preflight,
    promote_unreleased_changelog,
    sync_release_versions,
)


def test_promote_unreleased_changelog_moves_notes_into_version_section() -> None:
    source = """# Changelog

All notable changes to this project are documented here.

---

## [Unreleased]

### Added

- First release note

## [0.9.0] - 2026-08-09

### Added

- Older entry
"""

    result = promote_unreleased_changelog(source, version="1.0.1", release_date="2026-08-13")

    assert "## [Unreleased]\n\n## [1.0.1] - 2026-08-13" in result
    assert "### Added\n\n- First release note" in result
    assert result.index("## [1.0.1] - 2026-08-13") < result.index("## [0.9.0] - 2026-08-09")


def test_sync_release_versions_updates_all_release_files(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "webui").mkdir(parents=True)
    (repo / "desktop/src-tauri").mkdir(parents=True)
    (repo / "minibot/src/minibot").mkdir(parents=True)
    (repo / "packages/minibot-client").mkdir(parents=True)

    (repo / "webui/package.json").write_text(
        json.dumps({"name": "minibot-webui", "version": "0.1.0"}, indent=2) + "\n",
        encoding="utf-8",
    )
    (repo / "webui/package-lock.json").write_text(
        json.dumps(
            {"name": "minibot-webui", "version": "0.1.0", "packages": {"": {"name": "minibot-webui", "version": "0.1.0"}}},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (repo / "desktop/package.json").write_text(
        json.dumps({"name": "minibot-desktop", "version": "1.0.0-beta.2"}, indent=2) + "\n",
        encoding="utf-8",
    )
    (repo / "desktop/package-lock.json").write_text(
        json.dumps(
            {
                "name": "minibot-desktop",
                "version": "1.0.0-beta.2",
                "packages": {"": {"name": "minibot-desktop", "version": "1.0.0-beta.2"}},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (repo / "desktop/src-tauri/Cargo.toml").write_text(
        """[package]
name = "minibot-desktop"
version = "1.0.0-beta.2"
""",
        encoding="utf-8",
    )
    (repo / "desktop/src-tauri/Cargo.lock").write_text(
        """[[package]]
name = "minibot-desktop"
version = "1.0.0-beta.2"
""",
        encoding="utf-8",
    )
    (repo / "desktop/src-tauri/tauri.conf.json").write_text(
        json.dumps(
            {
                "productName": "minibot",
                "version": "1.0.0-beta.2",
                "bundle": {"windows": {"wix": {"version": "1.0.0.1"}}},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (repo / "minibot/pyproject.toml").write_text(
        """[project]
name = "minibot"
version = "0.1.0"
""",
        encoding="utf-8",
    )
    (repo / "minibot/src/minibot/__init__.py").write_text(
        '"""minibot FastAPI agent runtime."""\n\n__version__ = "0.1.0"\n',
        encoding="utf-8",
    )
    (repo / "packages/minibot-client/package.json").write_text(
        json.dumps({"name": "@liuyidi/minibot-client", "version": "0.1.0"}, indent=2) + "\n",
        encoding="utf-8",
    )
    (repo / "CHANGELOG.md").write_text(
        "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- First release note\n",
        encoding="utf-8",
    )
    (repo / "CHANGELOG.zh.md").write_text(
        "# 更新日志\n\n## [Unreleased]\n\n### 新增\n\n- 首次发布说明\n",
        encoding="utf-8",
    )

    changed = sync_release_versions(repo, "1.0.1", "2026-08-13")

    assert "webui/package.json" in changed
    assert json.loads((repo / "webui/package.json").read_text(encoding="utf-8"))["version"] == "1.0.1"
    assert json.loads((repo / "webui/package-lock.json").read_text(encoding="utf-8"))["packages"][""]["version"] == "1.0.1"
    assert json.loads((repo / "desktop/package.json").read_text(encoding="utf-8"))["version"] == "1.0.1"
    assert json.loads((repo / "desktop/package-lock.json").read_text(encoding="utf-8"))["packages"][""]["version"] == "1.0.1"
    assert 'version = "1.0.1"' in (repo / "desktop/src-tauri/Cargo.toml").read_text(encoding="utf-8")
    assert 'version = "1.0.1"' in (repo / "desktop/src-tauri/Cargo.lock").read_text(encoding="utf-8")
    tauri = json.loads((repo / "desktop/src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
    assert tauri["version"] == "1.0.1"
    assert tauri["bundle"]["windows"]["wix"]["version"] == "1.0.1.0"
    assert 'version = "1.0.1"' in (repo / "minibot/pyproject.toml").read_text(encoding="utf-8")
    assert '__version__ = "1.0.1"' in (repo / "minibot/src/minibot/__init__.py").read_text(encoding="utf-8")
    assert json.loads((repo / "packages/minibot-client/package.json").read_text(encoding="utf-8"))["version"] == "1.0.1"
    assert "## [1.0.1] - 2026-08-13" in (repo / "CHANGELOG.md").read_text(encoding="utf-8")
    assert "## [1.0.1] - 2026-08-13" in (repo / "CHANGELOG.zh.md").read_text(encoding="utf-8")


def test_check_release_preflight_requires_version_and_changelog_for_release_changes() -> None:
    changed_files = [
        "webui/src/components/thread/ComposerPalettes.tsx",
        "desktop/src/App.tsx",
    ]

    issues = check_release_preflight(
        changed_files=changed_files,
        version_files_changed=[],
        changelog_files_changed=[],
    )

    assert issues == [
        "Release-related source changes were detected, but no version or changelog files changed. Update the release version and CHANGELOG before merging."
    ]
