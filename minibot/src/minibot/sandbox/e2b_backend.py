"""E2B Firecracker microVM sandbox backend."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from minibot.sandbox.base import SandboxResult

log = logging.getLogger("minibot.sandbox.e2b")


@dataclass
class _SessionEntry:
    sandbox: Any
    last_used: float = field(default_factory=time.monotonic)


class E2BSandboxBackend:
    """One E2B sandbox per session_id; commands run inside the microVM."""

    name = "e2b"

    def __init__(
        self,
        *,
        api_key: str,
        sandbox_cls: Any | None = None,
        timeout_s: int = 900,
        idle_s: int = 900,
        default_cwd: str = "/home/user",
    ) -> None:
        self._api_key = (api_key or "").strip()
        self._sandbox_cls = sandbox_cls
        self._timeout_s = int(timeout_s)
        self._idle_s = int(idle_s)
        self._default_cwd = default_cwd
        self._sessions: dict[str, _SessionEntry] = {}
        self._lock = asyncio.Lock()

    def active_count(self) -> int:
        return len(self._sessions)

    def _resolve_cls(self) -> Any:
        if self._sandbox_cls is not None:
            return self._sandbox_cls
        try:
            from e2b import Sandbox
        except ImportError as exc:
            raise RuntimeError(
                "e2b package not installed; run: pip install 'minibot[e2b]'"
            ) from exc
        return Sandbox

    def _create_sandbox(self) -> Any:
        if not self._api_key:
            raise RuntimeError("E2B API key missing (MINIBOT_SERVER_E2B_API_KEY or E2B_API_KEY)")
        cls = self._resolve_cls()
        return cls.create(api_key=self._api_key, timeout=self._timeout_s)

    def _run_command(self, sandbox: Any, command: str, *, cwd: str, timeout_s: float) -> Any:
        return sandbox.commands.run(command, cwd=cwd, timeout=timeout_s)

    def _kill_sandbox(self, sandbox: Any) -> None:
        kill = getattr(sandbox, "kill", None)
        if callable(kill):
            kill()

    def _map_cwd(self, cwd: str) -> str:
        raw = (cwd or "").strip() or self._default_cwd
        # Host absolute paths are meaningless inside the VM — fall back to home.
        if raw in {".", "./"}:
            return self._default_cwd
        if raw.startswith(("/Users/", "/private/", "/var/folders", "/tmp/", "/data/")):
            return self._default_cwd
        if "/.minibot" in raw or "/.minibot-data" in raw:
            return self._default_cwd
        return raw

    async def _ensure(self, session_id: str) -> Any:
        key = (session_id or "").strip() or "_default"
        async with self._lock:
            await self._reap_idle_unlocked()
            entry = self._sessions.get(key)
            if entry is not None:
                entry.last_used = time.monotonic()
                return entry.sandbox
            sandbox = await asyncio.to_thread(self._create_sandbox)
            self._sessions[key] = _SessionEntry(sandbox=sandbox)
            log.info("e2b sandbox created session=%s active=%s", key, len(self._sessions))
            return sandbox

    async def _reap_idle_unlocked(self) -> None:
        if self._idle_s <= 0:
            return
        now = time.monotonic()
        expired = [sid for sid, ent in self._sessions.items() if now - ent.last_used > self._idle_s]
        for sid in expired:
            ent = self._sessions.pop(sid, None)
            if ent is None:
                continue
            try:
                await asyncio.to_thread(self._kill_sandbox, ent.sandbox)
            except Exception:  # noqa: BLE001
                log.warning("e2b kill failed session=%s", sid, exc_info=True)
            log.info("e2b sandbox reaped idle session=%s", sid)

    async def run(
        self,
        command: str,
        *,
        cwd: str,
        timeout_s: float,
        session_id: str,
    ) -> SandboxResult:
        sandbox = await self._ensure(session_id)
        mapped = self._map_cwd(cwd)
        try:
            result = await asyncio.to_thread(
                self._run_command,
                sandbox,
                command,
                cwd=mapped,
                timeout_s=timeout_s,
            )
        except Exception as exc:  # noqa: BLE001 — surface to tool string
            raise RuntimeError(f"e2b command failed: {exc}") from exc

        stdout = str(getattr(result, "stdout", "") or "")
        stderr = str(getattr(result, "stderr", "") or "")
        exit_code = int(getattr(result, "exit_code", 0) or 0)
        return SandboxResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            backend=self.name,
        )

    async def close_session(self, session_id: str) -> None:
        key = (session_id or "").strip() or "_default"
        async with self._lock:
            ent = self._sessions.pop(key, None)
        if ent is None:
            return
        try:
            await asyncio.to_thread(self._kill_sandbox, ent.sandbox)
        except Exception:  # noqa: BLE001
            log.warning("e2b kill failed session=%s", key, exc_info=True)
        log.info("e2b sandbox closed session=%s", key)

    async def aclose(self) -> None:
        async with self._lock:
            items = list(self._sessions.items())
            self._sessions.clear()
        for sid, ent in items:
            try:
                await asyncio.to_thread(self._kill_sandbox, ent.sandbox)
            except Exception:  # noqa: BLE001
                log.warning("e2b kill failed session=%s", sid, exc_info=True)


class LazyE2BSandboxBackend:
    """Boot-safe wrapper: errors only when exec actually runs without a key/SDK."""

    name = "e2b"

    def __init__(self, settings: Any) -> None:
        self._settings = settings
        self._inner: E2BSandboxBackend | None = None

    def active_count(self) -> int:
        return self._inner.active_count() if self._inner is not None else 0

    def _ensure_inner(self) -> E2BSandboxBackend:
        if self._inner is not None:
            return self._inner
        key = self._settings.resolved_e2b_api_key()
        if not key:
            raise RuntimeError(
                "E2B API key missing; set MINIBOT_SERVER_E2B_API_KEY or E2B_API_KEY"
            )
        self._inner = E2BSandboxBackend(
            api_key=key,
            timeout_s=int(getattr(self._settings, "e2b_timeout_s", 900) or 900),
            idle_s=int(getattr(self._settings, "e2b_idle_s", 900) or 900),
        )
        return self._inner

    async def run(
        self,
        command: str,
        *,
        cwd: str,
        timeout_s: float,
        session_id: str,
    ) -> SandboxResult:
        return await self._ensure_inner().run(
            command, cwd=cwd, timeout_s=timeout_s, session_id=session_id
        )

    async def close_session(self, session_id: str) -> None:
        if self._inner is None:
            return
        await self._inner.close_session(session_id)

    async def aclose(self) -> None:
        if self._inner is None:
            return
        await self._inner.aclose()
