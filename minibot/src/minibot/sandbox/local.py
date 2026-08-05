"""Local exec backend: workspace cwd + optional bubblewrap."""

from __future__ import annotations

import asyncio
import os
import shlex
import shutil
from pathlib import Path

from minibot.sandbox.base import SandboxResult
from minibot.security.workspace_access import current_workspace, is_path_within, resolve_in_workspace

_ENV_KEEP = ("PATH", "HOME", "LANG", "LC_ALL", "TERM", "TMPDIR")


def wrap_bwrap(command: str, workspace: Path, cwd: Path) -> str:
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


class LocalSandboxBackend:
    name = "local"

    async def run(
        self,
        command: str,
        *,
        cwd: str,
        timeout_s: float,
        session_id: str,
    ) -> SandboxResult:
        del session_id  # local backend is process-local; no session pool
        workspace = current_workspace()
        work = resolve_in_workspace(cwd or ".")
        if not work.is_dir():
            raise FileNotFoundError(f"working_dir is not a directory: {work}")
        if not is_path_within(work, workspace):
            raise PermissionError(f"working_dir outside workspace: {work}")

        if shutil.which("bwrap"):
            shell_cmd = wrap_bwrap(command, workspace, work)
        else:
            shell_cmd = command

        env = {k: os.environ[k] for k in _ENV_KEEP if k in os.environ}
        proc = await asyncio.create_subprocess_shell(
            shell_cmd,
            cwd=str(work),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
        except TimeoutError:
            with_suppress = getattr(proc, "kill", None)
            if callable(with_suppress):
                proc.kill()
            return SandboxResult(
                stdout="",
                stderr=f"command timed out after {timeout_s}s",
                exit_code=124,
                backend=self.name,
            )

        return SandboxResult(
            stdout=stdout_b.decode("utf-8", errors="replace"),
            stderr=stderr_b.decode("utf-8", errors="replace"),
            exit_code=int(proc.returncode or 0),
            backend=self.name,
        )

    async def close_session(self, session_id: str) -> None:
        del session_id
        return None
