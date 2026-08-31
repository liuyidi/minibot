"""Legacy single-directory migration tests."""

from __future__ import annotations

import json
import shutil
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


def test_migration_is_idempotent_when_source_cleared(tmp_path: Path) -> None:
    (tmp_path / "sessions").mkdir()
    (tmp_path / "config.json").write_text('{"model":"legacy"}\n', encoding="utf-8")
    (tmp_path / "sessions" / "chat.jsonl").write_text("session-data", encoding="utf-8")
    settings = Settings(data_dir=tmp_path, legacy_owner_user_id="user-demo")

    first = migrate_legacy_user_data(settings)
    assert first.migrated is True

    for name in ("sessions", "config.json"):
        path = tmp_path / name
        if path.is_dir():
            shutil.rmtree(path)
        elif path.is_file():
            path.unlink()

    second = migrate_legacy_user_data(settings)
    assert second.migrated is False
    assert second.reason == "no legacy data found"


def test_migration_skips_when_user_tree_exists_without_legacy_root(tmp_path: Path) -> None:
    owner_root = tmp_path / "users" / "owner"
    (owner_root / "sessions").mkdir(parents=True)
    (owner_root / "sessions" / "keep.jsonl").write_text("keep", encoding="utf-8")

    settings = Settings(data_dir=tmp_path, legacy_owner_user_id="owner")
    result = migrate_legacy_user_data(settings)

    assert result.migrated is False
    assert result.reason == "no legacy data found"
    assert (owner_root / "sessions" / "keep.jsonl").read_text(encoding="utf-8") == "keep"


def test_migration_copies_partial_legacy_tree(tmp_path: Path) -> None:
    (tmp_path / "sessions").mkdir()
    (tmp_path / "sessions" / "only.jsonl").write_text("only", encoding="utf-8")
    settings = Settings(data_dir=tmp_path, legacy_owner_user_id="partial-user")

    result = migrate_legacy_user_data(settings)

    owner_root = tmp_path / "users" / "partial-user"
    assert result.migrated is True
    assert (owner_root / "sessions" / "only.jsonl").read_text(encoding="utf-8") == "only"
    assert not (owner_root / "config.json").exists()


def test_migration_records_audit_entry(tmp_path: Path) -> None:
    (tmp_path / "sessions").mkdir()
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")
    settings = Settings(data_dir=tmp_path, legacy_owner_user_id="audit-user")

    migrate_legacy_user_data(settings)
    owner_root = tmp_path / "users" / "audit-user"
    records = json.loads((owner_root / "migrations.json").read_text(encoding="utf-8"))
    assert len(records) == 1
    assert records[0]["status"] == "completed"
    assert records[0]["owner_user_id"] == "audit-user"
