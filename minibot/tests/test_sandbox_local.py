# minibot/tests/test_sandbox_local.py
import pytest
from pathlib import Path

from minibot.sandbox.local import LocalSandboxBackend
from minibot.security.workspace_access import bind_workspace, reset_workspace


@pytest.mark.asyncio
async def test_local_echo(tmp_path: Path) -> None:
    token = bind_workspace(tmp_path)
    try:
        backend = LocalSandboxBackend()
        result = await backend.run(
            "echo hello-sandbox", cwd=".", timeout_s=10.0, session_id="s1"
        )
        assert result.exit_code == 0
        assert "hello-sandbox" in result.stdout
        assert result.backend == "local"
    finally:
        reset_workspace(token)
