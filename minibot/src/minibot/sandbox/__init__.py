"""Sandbox backends for tool exec (local cwd/bwrap or remote microVM)."""

from minibot.sandbox.base import SandboxBackend, SandboxResult
from minibot.sandbox.factory import build_sandbox_backend
from minibot.sandbox.local import LocalSandboxBackend

__all__ = [
    "SandboxBackend",
    "SandboxResult",
    "LocalSandboxBackend",
    "build_sandbox_backend",
]

