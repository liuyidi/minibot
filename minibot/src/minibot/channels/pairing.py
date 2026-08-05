"""Feishu DM pairing store (Layer 2 — OpenClaw-style pending allow/ignore)."""

from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


def _now() -> float:
    return time.time()


@dataclass
class PendingPairing:
    id: str
    channel: str
    sender_id: str
    chat_type: str = "p2p"
    created_at: float = 0.0
    status: str = "pending"  # pending | allowed | ignored

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "channel": self.channel,
            "sender_id": self.sender_id,
            "chat_type": self.chat_type,
            "created_at": self.created_at,
            "status": self.status,
            "label": self.sender_id,
            "from": self.sender_id,
        }


class PairingStore:
    def __init__(self, data_dir: Path) -> None:
        self.path = Path(data_dir) / "pairing" / "feishu.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._approved: set[str] = set()
        self._pending: dict[str, PendingPairing] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError):
            return
        self._approved = {str(x) for x in (raw.get("approved") or []) if str(x).strip()}
        pending: dict[str, PendingPairing] = {}
        for item in raw.get("pending") or []:
            try:
                p = PendingPairing(**item)
            except TypeError:
                continue
            if p.status == "pending":
                pending[p.id] = p
        self._pending = pending

    def _save(self) -> None:
        payload = {
            "approved": sorted(self._approved),
            "pending": [asdict(p) for p in self._pending.values()],
        }
        tmp = self.path.with_suffix(".json.tmp")
        try:
            with tmp.open("w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.path)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise

    def is_approved(self, sender_id: str) -> bool:
        return str(sender_id) in self._approved

    def approve_sender(self, sender_id: str) -> None:
        sid = str(sender_id).strip()
        if not sid:
            return
        self._approved.add(sid)
        # Drop matching pendings.
        drop = [pid for pid, p in self._pending.items() if p.sender_id == sid]
        for pid in drop:
            self._pending.pop(pid, None)
        self._save()

    def ensure_pending(self, sender_id: str, *, chat_type: str = "p2p") -> PendingPairing:
        sid = str(sender_id).strip()
        for p in self._pending.values():
            if p.sender_id == sid and p.status == "pending":
                return p
        item = PendingPairing(
            id=f"pair_{uuid.uuid4().hex[:12]}",
            channel="feishu",
            sender_id=sid,
            chat_type=chat_type,
            created_at=_now(),
        )
        self._pending[item.id] = item
        self._save()
        return item

    def list_pending(self) -> list[PendingPairing]:
        return sorted(self._pending.values(), key=lambda p: p.created_at, reverse=True)

    def allow(self, pairing_id: str) -> PendingPairing | None:
        item = self._pending.pop(pairing_id, None)
        if item is None:
            return None
        item.status = "allowed"
        self._approved.add(item.sender_id)
        self._save()
        return item

    def ignore(self, pairing_id: str) -> PendingPairing | None:
        item = self._pending.pop(pairing_id, None)
        if item is None:
            return None
        item.status = "ignored"
        self._save()
        return item

    def revoke(self, sender_id: str) -> bool:
        sid = str(sender_id).strip()
        if sid not in self._approved:
            return False
        self._approved.discard(sid)
        self._save()
        return True
