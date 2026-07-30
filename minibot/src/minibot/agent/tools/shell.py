"""Shell exec tool with workspace cwd + optional bwrap sandbox."""

from __future__ import annotations

import asyncio
import os
import shlex
import shutil
from pathlib import Path
from typing import Any

from minibot.agent.tools.base import Tool
from minibot.security.network import contains_internal_url
from minibot.security.workspace_access import (
    WorkspaceBoundaryError,
    current_workspace,
    is_path_within,
    resolve_in_workspace,
)

_ENV_KEEP = ("PATH", "HOME", "LANG", "LC_ALL", "TERM", "TMPDIR")


def _wrap_bwrap(command: str, workspace: Path, cwd: Path) -> str:
    ws = str(workspace)
    args = [
        "bwrap",
        "--new-session",
        "--die-with-parent",
        "--setenv",
        "HOME",
        ws,
        "--ro-bind",
        "/usr",
        "/usr",
        "--ro-bind-try",
        "/bin",
        "/bin",
        "--ro-bind-try",
        "/lib",
        "/lib",
        "--ro-bind-try",
        "/lib64",
        "/lib64",
        "--ro-bind-try",
        "/etc/ssl/certs",
        "/etc/ssl/certs",
        "--ro-bind-try",
        "/etc/resolv.conf",
        "/etc/resolv.conf",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--tmpfs",
        "/tmp",
        "--bind",
        ws,
        ws,
        "--chdir",
        str(cwd),
        "--",
        "sh",
        "-c",
        command,
    ]
    return shlex.join(args)


class ExecTool(Tool):
    name = "exec"
    description = (
        "Run a shell command with cwd restricted to the workspace. "
        "Uses bubblewrap (bwrap) when available; otherwise runs with restricted cwd only."
    )
    risk = "critical"
    source = "builtin"

    def __init__(self, *, timeout_s: float = 30.0, max_output: int = 20_000) -> None:
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
        if shutil.which("bwrap"):
            shell_cmd = _wrap_bwrap(command, workspace, cwd)
        else:
            shell_cmd = command

        env = {k: os.environ[k] for k in _ENV_KEEP if k in os.environ}
        try:
            proc = await asyncio.create_subprocess_shell(
                shell_cmd,
                cwd=str(cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except TimeoutError:
            return f"Error: command timed out after {timeout}s"
        except OSError as exc:
            return f"Error: {exc}"

        out = stdout.decode("utf-8", errors="replace")
        err = stderr.decode("utf-8", errors="replace")
        combined = out
        if err:
            combined = f"{out}\n[stderr]\n{err}" if out else f"[stderr]\n{err}"
        if len(combined) > self.max_output:
            combined = combined[: self.max_output] + "\n…(truncated)"
        code = proc.returncode
        return f"exit {code}\n{combined}".rstrip()
