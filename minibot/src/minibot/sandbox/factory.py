"""Build the configured sandbox backend."""

from __future__ import annotations

from typing import Any

from minibot.sandbox.base import SandboxBackend
from minibot.sandbox.e2b_backend import LazyE2BSandboxBackend
from minibot.sandbox.local import LocalSandboxBackend


def build_sandbox_backend(settings: Any) -> SandboxBackend:
    backend = settings.normalized_exec_backend()
    if backend == "e2b":
        return LazyE2BSandboxBackend(settings)
    return LocalSandboxBackend()
