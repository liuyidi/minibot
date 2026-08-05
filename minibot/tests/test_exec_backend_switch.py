"""Exec tool + settings sandbox backend wiring."""

from __future__ import annotations

import pytest
from pathlib import Path

from minibot.agent.tools.shell import ExecTool
from minibot.config.settings import get_settings
from minibot.sandbox.base import SandboxResult
from minibot.security.workspace_access import bind_workspace, reset_workspace


@pytest.mark.asyncio
async def test_exec_tool_uses_injected_backend(tmp_path: Path) -> None:
    class Stub:
        name = "stub"

        async def run(self, command, *, cwd, timeout_s, session_id):
            return SandboxResult("STUB_OUT", "", 0, "stub")

        async def close_session(self, session_id):
            return None

    token = bind_workspace(tmp_path)
    try:
        tool = ExecTool(backend=Stub())
        out = await tool.execute(command="echo hi")
        assert "STUB_OUT" in out
    finally:
        reset_workspace(token)


def test_settings_reports_exec_sandbox(client, auth_headers, monkeypatch) -> None:
    # Default test app uses local; assert field exists
    payload = client.get("/api/settings", headers=auth_headers).json()
    assert "exec_sandbox" in payload["agent"]
    assert payload["agent"]["exec_sandbox"] in {"local", "e2b"}
