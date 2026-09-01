"""Disk-backed session store (one JSONL file per session)."""

from __future__ import annotations

import copy
import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from minibot.agent.runner import new_chat_id
from minibot.security.workspace_access import normalize_access_mode
from minibot.workspace import WorkspaceError, default_workspace, normalize_workspace

_UNSAFE = re.compile(r"[^\w.\-]+", re.UNICODE)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_session_filename(session_id: str) -> str:
    """Map an arbitrary session id to a safe JSONL stem."""
    stem = _UNSAFE.sub("_", session_id).strip("._") or "session"
    return stem


def count_webui_thread_messages(messages: list[dict[str, Any]]) -> int:
    """Count messages that appear in ``GET .../webui-thread`` (user/assistant with body)."""
    count = 0
    for msg in messages:
        role = msg.get("role")
        if role not in {"user", "assistant"}:
            continue
        content = msg.get("content")
        text = content if isinstance(content, str) else ""
        media_paths = msg.get("media")
        paths: list[str] = []
        if isinstance(media_paths, list):
            paths = [str(p) for p in media_paths if p]
        if text.strip() or paths:
            count += 1
    return count


def messages_before_user_index(
    messages: list[dict[str, Any]],
    before_user_index: int,
) -> list[dict[str, Any]]:
    """Return a deep copy of messages strictly before the N-th ``role=user`` entry.

    ``before_user_index`` is 0-based among user turns. ``0`` → empty; ``>= user
    count`` → full history (including tool turns).
    """
    if before_user_index <= 0:
        return []
    user_i = 0
    cut = len(messages)
    for i, msg in enumerate(messages):
        if msg.get("role") == "user":
            if user_i == before_user_index:
                cut = i
                break
            user_i += 1
    return copy.deepcopy(messages[:cut])


@dataclass
class Session:
    id: str
    title: str = ""
    messages: list[dict[str, Any]] = field(default_factory=list)
    workspace_path: str = field(default_factory=lambda: str(default_workspace()))
    access_mode: str = "restricted"
    summary: str = ""
    """UI divider: how many webui-thread messages were inherited from the source."""
    fork_boundary_message_count: int | None = None
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)

    def touch(self) -> None:
        self.updated_at = _now()

    def workspace_scope(self) -> dict[str, Any]:
        mode = normalize_access_mode(self.access_mode)
        name = self.workspace_path.rstrip("/").rsplit("/", 1)[-1] or self.workspace_path
        return {
            "project_path": self.workspace_path,
            "project_name": name,
            "access_mode": mode,
            "restrict_to_workspace": mode == "restricted",
        }

    def preview(self) -> str:
        for msg in reversed(self.messages):
            if msg.get("role") == "user" and isinstance(msg.get("content"), str):
                text = msg["content"].strip()
                return text[:120]
        return ""


class SessionStore:
    """Persist sessions under ``{data_dir}/sessions/<id>.jsonl``.

    In-memory ``_cache`` is a read-through cache; every mutating call writes
    atomically (tmp + ``os.replace``).
    """

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = Path(data_dir)
        self.sessions_dir = self.data_dir / "sessions"
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, Session] = {}

    def _path_for(self, session_id: str) -> Path:
        return self.sessions_dir / f"{safe_session_filename(session_id)}.jsonl"

    def create(
        self,
        *,
        title: str = "",
        session_id: str | None = None,
        workspace: Path | str | None = None,
        access_mode: str | None = None,
    ) -> Session:
        sid = session_id or new_chat_id()
        if not sid:
            sid = new_chat_id()
        existing = self.get(sid)
        if existing is not None:
            return existing
        ws = normalize_workspace(workspace, must_exist=True)
        session = Session(
            id=sid,
            title=title,
            workspace_path=str(ws),
            access_mode=normalize_access_mode(access_mode),
        )
        self._save(session)
        self._cache[session.id] = session
        return session

    def fork_from(
        self,
        source_session_id: str,
        *,
        before_user_index: int,
        title: str = "",
    ) -> Session:
        """Create a non-destructive fork keeping history before ``before_user_index``.

        Raises ``KeyError`` if the source session is missing.
        Raises ``ValueError`` if ``before_user_index`` is not an int ``>= 0``.
        """
        if not isinstance(before_user_index, int) or isinstance(before_user_index, bool):
            raise ValueError("before_user_index must be an integer >= 0")
        if before_user_index < 0:
            raise ValueError("before_user_index must be an integer >= 0")

        source = self.get(source_session_id)
        if source is None:
            raise KeyError(f"unknown session: {source_session_id}")

        prefix = messages_before_user_index(source.messages, before_user_index)
        boundary = count_webui_thread_messages(prefix) if prefix else None
        forked = self.create(
            title=(title or "").strip(),
            workspace=source.workspace_path,
            access_mode=source.access_mode,
        )
        forked.messages = prefix
        forked.summary = source.summary if prefix else ""
        forked.fork_boundary_message_count = boundary
        if not forked.title and prefix:
            for msg in prefix:
                if msg.get("role") == "user" and isinstance(msg.get("content"), str):
                    text = msg["content"].strip()
                    if text:
                        forked.title = text[:60]
                        break
        forked.touch()
        self._save(forked)
        self._cache[forked.id] = forked
        return forked

    def set_workspace(
        self,
        session_id: str,
        workspace: Path | str,
        *,
        access_mode: str | None = None,
    ) -> Session:
        """Update ``workspace_path`` (must exist and be a directory)."""
        session = self.get(session_id)
        if session is None:
            raise KeyError(f"unknown session: {session_id}")
        try:
            ws = normalize_workspace(workspace, must_exist=True)
        except WorkspaceError:
            raise
        session.workspace_path = str(ws)
        if access_mode is not None:
            session.access_mode = normalize_access_mode(access_mode)
        session.touch()
        self._save(session)
        self._cache[session.id] = session
        return session

    def get(self, session_id: str) -> Session | None:
        if session_id in self._cache:
            return self._cache[session_id]
        session = self._load(session_id)
        if session is not None:
            self._cache[session.id] = session
        return session

    def list(self) -> list[Session]:
        seen: set[str] = set()
        sessions: list[Session] = []
        for path in self.sessions_dir.glob("*.jsonl"):
            if path.name.endswith(".jsonl.tmp"):
                continue
            sid = path.stem
            session = self.get(sid)
            if session is None:
                continue
            seen.add(session.id)
            sessions.append(session)
        for sid, session in self._cache.items():
            if sid not in seen:
                sessions.append(session)
        return sorted(sessions, key=lambda s: s.updated_at, reverse=True)

    def delete(self, session_id: str) -> bool:
        self._cache.pop(session_id, None)
        path = self._path_for(session_id)
        if not path.exists():
            return False
        path.unlink()
        return True

    def list_disk_files(self) -> list[str]:
        """Return ``*.jsonl`` basenames under ``sessions_dir`` (sorted)."""
        return [e["name"] for e in self.list_disk_entries()]

    def list_disk_entries(self) -> list[dict[str, str]]:
        """Return file entries with ``name`` / ``created_at`` / ``updated_at``.

        Timestamps prefer JSONL metadata; fall back to filesystem ctime/mtime.
        """
        entries: list[dict[str, str]] = []
        for path in self.sessions_dir.glob("*.jsonl"):
            if path.name.endswith(".tmp"):
                continue
            created_at = ""
            updated_at = ""
            try:
                with path.open(encoding="utf-8") as f:
                    first = f.readline().strip()
                if first:
                    data = json.loads(first)
                    if data.get("_type") == "metadata":
                        created_at = str(data.get("created_at") or "")
                        updated_at = str(data.get("updated_at") or "")
            except (OSError, json.JSONDecodeError, TypeError):
                pass
            try:
                st = path.stat()
                if not created_at:
                    created_at = datetime.fromtimestamp(st.st_ctime, tz=timezone.utc).isoformat()
                if not updated_at:
                    updated_at = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
            except OSError:
                pass
            entries.append(
                {
                    "name": path.name,
                    "created_at": created_at,
                    "updated_at": updated_at,
                }
            )
        return sorted(entries, key=lambda e: e["name"])

    def append_messages(self, session_id: str, messages: list[dict[str, Any]]) -> Session | None:
        session = self.get(session_id)
        if session is None:
            return None
        session.messages.extend(messages)
        if not session.title:
            for msg in messages:
                if msg.get("role") == "user" and isinstance(msg.get("content"), str):
                    session.title = msg["content"].strip()[:60]
                    break
        session.touch()
        self._save(session)
        self._cache[session.id] = session
        return session

    def replace_messages(self, session_id: str, messages: list[dict[str, Any]]) -> Session | None:
        """Replace the entire message list (import / race-demo lost-update)."""
        session = self.get(session_id)
        if session is None:
            return None
        session.messages = list(messages)
        session.touch()
        self._save(session)
        self._cache[session.id] = session
        return session

    def apply_compaction(
        self,
        session_id: str,
        *,
        messages: list[dict[str, Any]],
        summary: str,
    ) -> Session | None:
        """Replace messages and set archival summary (Phase 3a)."""
        session = self.get(session_id)
        if session is None:
            return None
        session.messages = list(messages)
        session.summary = summary
        session.touch()
        self._save(session)
        self._cache[session.id] = session
        return session

    def _load(self, session_id: str) -> Session | None:
        path = self._path_for(session_id)
        if not path.exists():
            return None
        try:
            messages: list[dict[str, Any]] = []
            title = ""
            created_at = _now()
            updated_at = created_at
            file_id = session_id
            workspace_path = str(default_workspace())
            access_mode = "restricted"
            summary = ""
            fork_boundary_message_count: int | None = None

            with path.open(encoding="utf-8") as f:
                for raw in f:
                    line = raw.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if data.get("_type") == "metadata":
                        file_id = str(data.get("id") or session_id)
                        title = str(data.get("title") or "")
                        if data.get("created_at"):
                            created_at = str(data["created_at"])
                        if data.get("updated_at"):
                            updated_at = str(data["updated_at"])
                        if data.get("workspace_path"):
                            workspace_path = str(data["workspace_path"])
                        if data.get("access_mode"):
                            access_mode = normalize_access_mode(str(data["access_mode"]))
                        if data.get("summary"):
                            summary = str(data["summary"])
                        raw_boundary = data.get("fork_boundary_message_count")
                        if isinstance(raw_boundary, int) and not isinstance(raw_boundary, bool):
                            fork_boundary_message_count = max(0, raw_boundary)
                    else:
                        messages.append(data)

            return Session(
                id=file_id,
                title=title,
                messages=messages,
                workspace_path=workspace_path,
                access_mode=access_mode,
                summary=summary,
                fork_boundary_message_count=fork_boundary_message_count,
                created_at=created_at,
                updated_at=updated_at,
            )
        except OSError:
            return None

    def _save(self, session: Session) -> None:
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        path = self._path_for(session.id)
        tmp_path = path.with_suffix(".jsonl.tmp")
        meta: dict[str, Any] = {
            "_type": "metadata",
            "id": session.id,
            "title": session.title,
            "workspace_path": session.workspace_path,
            "access_mode": normalize_access_mode(session.access_mode),
            "summary": session.summary,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
        }
        if session.fork_boundary_message_count is not None:
            meta["fork_boundary_message_count"] = int(session.fork_boundary_message_count)
        try:
            with tmp_path.open("w", encoding="utf-8") as f:
                f.write(json.dumps(meta, ensure_ascii=False) + "\n")
                for msg in session.messages:
                    f.write(json.dumps(msg, ensure_ascii=False) + "\n")
            os.replace(tmp_path, path)
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
