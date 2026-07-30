"""JSON file store for cron jobs."""

from __future__ import annotations

import json
import logging
import shutil
import time
from pathlib import Path

from minibot.cron.types import CronStoreFile

logger = logging.getLogger(__name__)


class JobStore:
    """Atomic load/save of ``jobs.json``."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> CronStoreFile:
        if not self.path.exists():
            return CronStoreFile()
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise ValueError("store root must be object")
            return CronStoreFile.from_dict(raw)
        except Exception as exc:
            backup = self.path.with_suffix(f".corrupt-{int(time.time())}.json")
            try:
                shutil.copy2(self.path, backup)
            except OSError:
                pass
            logger.exception("cron store corrupt at %s; backup=%s", self.path, backup)
            raise RuntimeError(f"cron store corrupt: {exc}") from exc

    def save(self, store: CronStoreFile) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(store.to_dict(), ensure_ascii=False, indent=2)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(payload + "\n", encoding="utf-8")
        tmp.replace(self.path)
