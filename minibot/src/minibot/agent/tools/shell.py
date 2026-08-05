"""Shell exec tool with pluggable sandbox backend."""

from __future__ import annotations

from typing import Any

from minibot.agent.tools.base import Tool
from minibot.sandbox.base import SandboxBackend
from minibot.sandbox.local import LocalSandboxBackend
from minibot.security.network import contains_internal_url
from minibot.security.session_context import current_session_id
from minibot.security.workspace_access import (
    WorkspaceBoundaryError,
    current_workspace,
    is_path_within,
    resolve_in_workspace,
)


class ExecTool(Tool):
    name = "exec"
    description = (
        "Run a shell command with cwd restricted to the workspace. "
        "Uses the configured sandbox backend (local bwrap/cwd, or E2B microVM)."
    )
    risk = "critical"
    source = "builtin"

    def __init__(
        self,
        *,
        backend: SandboxBackend | None = None,
        timeout_s: float = 30.0,
        max_output: int = 20_000,
    ) -> None:
        self._backend: SandboxBackend = backend or LocalSandboxBackend()
        self.timeout_s = timeout_s
        self.max_output = max_output

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to run"},
                "working_dir": {
                    "type": "string",
                    "description": "Working directory inside workspace (default .)",
                },
                "timeout": {"type": "number", "description": "Timeout seconds"},
            },
            "required": ["command"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        command = str(kwargs.get("command") or kwargs.get("cmd") or "").strip()
        if not command:
            return "Error: empty command"
        if contains_internal_url(command):
            return "Error: command contains URL targeting private/internal address (SSRF guard)"

        workspace = current_workspace()
        raw_cwd = kwargs.get("working_dir") or kwargs.get("workdir") or "."
        cwd = resolve_in_workspace(str(raw_cwd))
        if not cwd.is_dir():
            raise WorkspaceBoundaryError(f"working_dir is not a directory: {cwd}")
        if not is_path_within(cwd, workspace):
            raise WorkspaceBoundaryError(f"working_dir outside workspace: {cwd}")

        timeout = float(kwargs.get("timeout") or self.timeout_s)
        session_id = current_session_id() or ""
        try:
            result = await self._backend.run(
                command,
                cwd=str(cwd),
                timeout_s=timeout,
                session_id=session_id,
            )
        except TimeoutError:
            return f"Error: command timed out after {timeout}s"
        except OSError as exc:
            return f"Error: {exc}"
        except RuntimeError as exc:
            return f"Error: {exc}"

        combined = result.stdout
        if result.stderr:
            combined = (
                f"{result.stdout}\n[stderr]\n{result.stderr}"
                if result.stdout
                else f"[stderr]\n{result.stderr}"
            )
        if len(combined) > self.max_output:
            combined = combined[: self.max_output] + "\n…(truncated)"
        return f"exit {result.exit_code}\n{combined}".rstrip()
