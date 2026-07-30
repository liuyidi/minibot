"""Phase 5: MCP presets config + manager inject/unregister."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from minibot.agent.tools.base import Tool
from minibot.agent.tools.mcp import McpManager, sanitize_name, tool_prefix
from minibot.agent.tools.registry import ToolRegistry
from minibot.config.app_config import AppConfig, settings_public_payload
from minibot.config.mcp_presets import (
    McpPreset,
    McpPresetError,
    delete_mcp_preset,
    mask_headers,
    set_mcp_enabled,
    upsert_mcp_preset,
)


class _FakeTool(Tool):
    source = "mcp"
    category = "mcp"

    def __init__(self, name: str, server: str = "fs"):
        self.name = name
        self.description = name
        self.server_name = server

    async def execute(self, **kwargs: Any) -> str:
        return "ok"


def test_sanitize_and_prefix():
    assert sanitize_name("a/b c") == "a_b_c"
    assert tool_prefix("fs") == "mcp_fs_"


def test_upsert_delete_mask_headers():
    cfg = AppConfig()
    preset = upsert_mcp_preset(
        cfg,
        label="Filesystem",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        headers={"Authorization": "Bearer secret-token-value"},
    )
    assert preset.id == "filesystem"
    assert len(cfg.mcp_presets) == 1
    public = settings_public_payload(cfg)
    assert public["mcp_presets"][0]["headers"]["Authorization"].startswith("Bear")
    assert "secret-token-value" not in public["mcp_presets"][0]["headers"]["Authorization"]

    set_mcp_enabled(cfg, preset.id, True)
    assert find_enabled(cfg, preset.id)

    delete_mcp_preset(cfg, preset.id)
    assert cfg.mcp_presets == []


def find_enabled(cfg: AppConfig, pid: str) -> bool:
    return next(p.enabled for p in cfg.mcp_presets if p.id == pid)


def test_upsert_requires_command_or_url():
    cfg = AppConfig()
    with pytest.raises(McpPresetError):
        upsert_mcp_preset(cfg, label="empty")


def test_mask_headers_keeps_non_secret():
    assert mask_headers({"X-Custom": "plain", "Authorization": "abcd1234"})["X-Custom"] == "plain"
    assert mask_headers({"Authorization": "abcd1234"})["Authorization"] == "****"


def test_manager_disconnect_unregisters_prefix():
    import asyncio

    reg = ToolRegistry()
    mgr = McpManager(reg)
    reg.register(_FakeTool("mcp_fs_list", "fs"))
    reg.register(_FakeTool("mcp_fs_read", "fs"))
    reg.register(_FakeTool("echo"))

    mgr._status["fs"] = SimpleNamespace(
        preset_id="fs",
        connected=True,
        transport="stdio",
        tool_names=["mcp_fs_list", "mcp_fs_read"],
        last_error=None,
        connected_at="t",
    )

    async def _run():
        return await mgr.disconnect("fs")

    result = asyncio.run(_run())
    assert "mcp_fs_list" in result["removed_tools"]
    assert reg.get("mcp_fs_list") is None
    assert reg.get("mcp_fs_read") is None
    snap = mgr.snapshot()
    assert any(e["kind"] == "disconnect" for e in snap["events"])


def test_manager_test_bad_command_sets_error():
    import asyncio

    reg = ToolRegistry()
    mgr = McpManager(reg)
    preset = McpPreset(
        id="bad",
        label="bad",
        type="stdio",
        command="minibot-mcp-does-not-exist-xyz",
        args=[],
    )

    async def _run():
        return await mgr.test(preset)

    result = asyncio.run(_run())
    assert result["ok"] is False
    assert result.get("error")
    assert not any(n.startswith("mcp_bad_") or n.startswith("mcp___test_") for n in reg._tools)


def test_api_mcp_list_and_dev(client, auth_headers):
    r = client.get("/api/settings/mcp-presets", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "presets" in body
    assert "runtime" in body

    r2 = client.get("/api/dev/mcp", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json().get("ok") is True

    bad = client.post(
        "/api/settings/mcp-presets/test",
        headers=auth_headers,
        json={"id": "x", "type": "stdio", "command": "minibot-mcp-does-not-exist-xyz", "args": []},
    )
    assert bad.status_code == 200
    assert bad.json()["ok"] is False


def test_mcp_templates_and_page(client, auth_headers):
    r = client.get("/api/settings/mcp-presets/templates", headers=auth_headers)
    assert r.status_code == 200
    ids = {t["id"] for t in r.json()["templates"]}
    assert "context7-stdio" in ids
    assert "context7-http" in ids

    created = client.post(
        "/api/settings/mcp-presets/from-template",
        headers=auth_headers,
        json={"template_id": "context7-http", "api_key": "ck-test", "enable": False},
    )
    assert created.status_code == 200
    preset = created.json()["preset"]
    assert preset["id"] == "context7"
    assert preset["url"].startswith("https://mcp.context7.com")
    # key masked in public payload
    assert "ck-test" not in json.dumps(preset)

    page = client.get("/ui/mcp.html")
    assert page.status_code == 200
    assert "Templates" in page.text
    assert "Invoke" in page.text
    assert "pipeline" in page.text


def test_mcp_page_served(client):
    r = client.get("/ui/mcp.html")
    assert r.status_code == 200
    text = r.text
    assert "情景实验室" in text
    assert "坏 command" in text
    assert "Context7" in text

