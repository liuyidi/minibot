"""Legacy single-directory migration tests."""

from __future__ import annotations

from pathlib import Path

from minibot.config.settings import Settings
from minibot.migration import migrate_legacy_user_data


def test_migration_skips_when_owner_missing(tmp_path: Path) -> None:
    (tmp_path / "sessions").mkdir()
    (tmp_path / "sessions" / "demo.jsonl").write_text("{}", encoding="utf-8")
    settings = Settings(data_dir=tmp_path, legacy_owner_user_id="")

    result = migrate_legacy_user_data(settings)

    assert result.migrated is False
    assert not (tmp_path / "users").exists()


def test_migration_copies_legacy_files_to_owner(tmp_path: Path) -> None:
    (tmp_path / "sessions").mkdir()
    (tmp_path / "pairing").mkdir()
    (tmp_path / "approvals").mkdir()
    (tmp_path / "usage").mkdir()
    (tmp_path / "media").mkdir()
    (tmp_path / "workspace").mkdir()
    (tmp_path / "mcp").mkdir()
    (tmp_path / "logs").mkdir()
    (tmp_path / "config.json").write_text("{\"model\":\"legacy\"}\n", encoding="utf-8")
    (tmp_path / "sessions" / "chat.jsonl").write_text("session-data", encoding="utf-8")
    (tmp_path / "pairing" / "feishu.json").write_text("pairing-data", encoding="utf-8")

    settings = Settings(data_dir=tmp_path, legacy_owner_user_id="user-demo")

    result = migrate_legacy_user_data(settings)

    owner_root = tmp_path / "users" / "user-demo"
    assert result.migrated is True
    assert result.destination == owner_root
    assert (owner_root / "config.json").is_file()
    assert (owner_root / "sessions" / "chat.jsonl").read_text(encoding="utf-8") == "session-data"
    assert (owner_root / "pairing" / "feishu.json").read_text(encoding="utf-8") == "pairing-data"
    assert (owner_root / "migrations.json").is_file()
