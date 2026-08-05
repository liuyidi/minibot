"""Sandbox backend protocol."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class SandboxResult:
    stdout: str
    stderr: str
    exit_code: int
    backend: str


class SandboxBackend(Protocol):
    name: str

    async def run(
        self,
        command: str,
        *,
        cwd: str,
        timeout_s: float,
        session_id: str,
    ) -> SandboxResult: ...

    async def close_session(self, session_id: str) -> None: ...
