"""Filesystem migration helpers for legacy single-directory installs."""

from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from minibot.config.settings import Settings
from minibot.user_runtime import resolve_user_root


@dataclass(slots=True)
class MigrationResult:
    migrated: bool
    source: Path | None = None
    destination: Path | None = None
    reason: str = ""


def _copy_tree(src: Path, dst: Path) -> None:
    if not src.exists():
        return
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dst / item.name
        if item.is_dir():
            shutil.copytree(item, target, dirs_exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)


def _record_migration(owner_root: Path, payload: dict) -> None:
    path = owner_root / "migrations.json"
    existing: list[dict] = []
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                existing = [item for item in raw if isinstance(item, dict)]
        except Exception:
            existing = []
    existing.append(payload)
    path.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def migrate_legacy_user_data(settings: Settings) -> MigrationResult:
    owner_user_id = settings.normalized_legacy_owner_user_id()
    if not owner_user_id:
        return MigrationResult(migrated=False, reason="legacy owner not configured")

    src = settings.data_dir.expanduser()
    dst = resolve_user_root(settings, owner_user_id)
    if src.resolve() == dst.resolve():
        return MigrationResult(migrated=False, source=src, destination=dst, reason="already rooted")

    legacy_config = src / "config.json"
    legacy_sessions = src / "sessions"
    legacy_pairing = src / "pairing"
    legacy_approvals = src / "approvals"
    legacy_usage = src / "usage"
    legacy_media = src / "media"
    legacy_workspaces = src / "workspace"
    legacy_mcp = src / "mcp"
    legacy_logs = src / "logs"

    if not any(p.exists() for p in [legacy_config, legacy_sessions, legacy_pairing, legacy_approvals, legacy_usage, legacy_media, legacy_workspaces, legacy_mcp, legacy_logs]):
        return MigrationResult(migrated=False, source=src, destination=dst, reason="no legacy data found")

    dst.mkdir(parents=True, exist_ok=True)
    _copy_tree(legacy_sessions, dst / "sessions")
    _copy_tree(legacy_pairing, dst / "pairing")
    _copy_tree(legacy_approvals, dst / "approvals")
    _copy_tree(legacy_usage, dst / "usage")
    _copy_tree(legacy_media, dst / "media")
    _copy_tree(legacy_workspaces, dst / "workspace")
    _copy_tree(legacy_mcp, dst / "mcp")
    _copy_tree(legacy_logs, dst / "logs")
    if legacy_config.exists():
        shutil.copy2(legacy_config, dst / "config.json")
    _record_migration(
        dst,
        {
            "source": str(src),
            "destination": str(dst),
            "owner_user_id": owner_user_id,
            "status": "completed",
        },
    )
    return MigrationResult(migrated=True, source=src, destination=dst)
