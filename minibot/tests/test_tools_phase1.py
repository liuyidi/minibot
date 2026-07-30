"""Phase 1 tools + security tests."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from minibot.agent.tools.builtin import register_default_tools
from minibot.agent.tools.filesystem import EditFileTool, ReadFileTool, WriteFileTool
from minibot.security.network import validate_url_target
from minibot.security.workspace_access import (
    WorkspaceBoundaryError,
    bind_workspace,
    reset_workspace,
    resolve_in_workspace,
)


def test_workspace_blocks_etc_passwd(tmp_path: Path) -> None:
    token = bind_workspace(tmp_path)
    try:
        with pytest.raises(WorkspaceBoundaryError):
            resolve_in_workspace("/etc/passwd")
        ok = resolve_in_workspace("notes.txt")
        assert ok == (tmp_path / "notes.txt").resolve()
    finally:
        reset_workspace(token)


def test_ssrf_blocks_link_local() -> None:
    ok, err = validate_url_target("http://169.254.169.254/")
    assert ok is False
    assert "Blocked" in err or "private" in err.lower() or "internal" in err.lower()


def test_filesystem_read_write_edit(tmp_path: Path) -> None:
    async def _run() -> None:
        token = bind_workspace(tmp_path)
        try:
            write = WriteFileTool()
            read = ReadFileTool()
            edit = EditFileTool()
            await write.execute(path="a.txt", content="hello world\n")
            text = await read.execute(path="a.txt")
            assert "hello world" in text
            msg = await edit.execute(path="a.txt", old_text="hello world", new_text="hello minibot")
            assert "Edited" in msg
            again = (tmp_path / "a.txt").read_text(encoding="utf-8")
            assert again == "hello minibot\n"
        finally:
            reset_workspace(token)

    asyncio.run(_run())


def test_edit_trim_match(tmp_path: Path) -> None:
    async def _run() -> None:
        token = bind_workspace(tmp_path)
        try:
            (tmp_path / "b.py").write_text("  def foo():\n      return 1\n", encoding="utf-8")
            edit = EditFileTool()
            msg = await edit.execute(
                path="b.py",
                old_text="def foo():\n    return 1",
                new_text="def foo():\n    return 2",
            )
            assert "Edited" in msg
            assert "return 2" in (tmp_path / "b.py").read_text(encoding="utf-8")
        finally:
            reset_workspace(token)

    asyncio.run(_run())


def test_read_file_denied_outside(tmp_path: Path) -> None:
    async def _run() -> None:
        tools = register_default_tools()
        token = bind_workspace(tmp_path)
        try:
            result = await tools.execute("read_file", {"path": "/etc/passwd"})
            assert result.startswith("Error:")
            recent = tools.recent_calls()
            assert recent
            assert recent[0]["denied_reason"] == "workspace"
        finally:
            reset_workspace(token)

    asyncio.run(_run())


def test_web_fetch_ssrf_recorded(tmp_path: Path) -> None:
    async def _run() -> None:
        tools = register_default_tools()
        token = bind_workspace(tmp_path)
        try:
            result = await tools.execute("web_fetch", {"url": "http://169.254.169.254/"})
            assert result.startswith("Error:")
            assert tools.recent_calls()[0]["denied_reason"] == "ssrf"
        finally:
            reset_workspace(token)

    asyncio.run(_run())


def test_exec_echo(tmp_path: Path) -> None:
    async def _run() -> None:
        tools = register_default_tools()
        token = bind_workspace(tmp_path)
        try:
            result = await tools.execute("exec", {"command": "echo hi-from-exec"})
            assert "hi-from-exec" in result
            assert "exit 0" in result
        finally:
            reset_workspace(token)

    asyncio.run(_run())


def test_dev_tools_api(client: TestClient, auth_headers: dict[str, str]) -> None:
    res = client.get("/api/dev/tools", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    names = {t["name"] for t in body["tools"]}
    assert "read_file" in names
    assert "exec" in names
    assert "web_fetch" in names
    assert "get_weather" not in names

    page = client.get("/ui/tools.html")
    assert page.status_code == 200
    assert "Registered tools" in page.text

    deny = client.post(
        "/api/dev/tools/deny-demo",
        headers=auth_headers,
        json={"kind": "workspace"},
    )
    assert deny.status_code == 200
    data = deny.json()
    assert data["denied_reason"] == "workspace"
    assert data["ok"] is False
