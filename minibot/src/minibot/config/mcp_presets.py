"""MCP server presets (Phase 5 MVP)."""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field

_SLUG_RE = re.compile(r"[^a-z0-9]+")
_SECRET_HEADER_KEYS = frozenset(
    {
        "authorization",
        "proxy-authorization",
        "x-api-key",
        "api-key",
        "api_key",
        "context7_api_key",
    }
)


class McpPreset(BaseModel):
    id: str
    label: str = ""
    enabled: bool = False
    type: Literal["stdio", "sse", "streamableHttp"] | None = None
    command: str = ""
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)
    cwd: str = ""
    url: str = ""
    headers: dict[str, str] = Field(default_factory=dict)
    tool_timeout: int = 30
    enabled_tools: list[str] = Field(default_factory=lambda: ["*"])


class McpPresetError(ValueError):
    """User-facing MCP preset validation / state error."""


def slugify(value: str, *, fallback: str = "mcp") -> str:
    text = (value or "").strip().lower()
    text = _SLUG_RE.sub("-", text).strip("-")
    return text or fallback


def mask_header_value(key: str, value: str) -> str:
    if not value:
        return ""
    if key.strip().lower() not in _SECRET_HEADER_KEYS:
        return value
    if len(value) > 8:
        return f"{value[:4]}…{value[-4:]}"
    return "****"


def mask_headers(headers: dict[str, str] | None) -> dict[str, str]:
    return {k: mask_header_value(k, v) for k, v in (headers or {}).items()}


def infer_transport(preset: McpPreset) -> str:
    if preset.type:
        return preset.type
    if preset.command.strip():
        return "stdio"
    if preset.url.strip():
        return "sse" if preset.url.rstrip("/").endswith("/sse") else "streamableHttp"
    raise McpPresetError("preset needs command (stdio) or url (http)")


def preset_public(preset: McpPreset) -> dict[str, Any]:
    data = preset.model_dump()
    data["headers"] = mask_headers(preset.headers)
    data["inferred_type"] = None
    try:
        data["inferred_type"] = infer_transport(preset)
    except McpPresetError:
        pass
    return data


def presets_public_list(config: Any) -> list[dict[str, Any]]:
    return [preset_public(p) for p in getattr(config, "mcp_presets", []) or []]


def ensure_default_mcp_presets(config: Any) -> Any:
    """Seed starter MCP connectors for @ mentions when the user has none."""
    presets = list(getattr(config, "mcp_presets", None) or [])
    if presets:
        return config
    config.mcp_presets = [
        McpPreset(
            id="fs",
            label="Filesystem",
            enabled=True,
            type="stdio",
            command="npx",
            args=["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            tool_timeout=30,
            enabled_tools=["*"],
        ),
        McpPreset(
            id="context7",
            label="Context7",
            enabled=False,
            type="stdio",
            command="npx",
            args=["-y", "@upstash/context7-mcp@latest"],
            tool_timeout=60,
            enabled_tools=["*"],
        ),
    ]
    return config


def find_preset(config: Any, preset_id: str) -> McpPreset | None:
    for preset in getattr(config, "mcp_presets", []) or []:
        if preset.id == preset_id:
            return preset
    return None


def upsert_mcp_preset(
    config: Any,
    *,
    preset_id: str | None = None,
    label: str | None = None,
    enabled: bool | None = None,
    type: str | None = None,
    command: str | None = None,
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
    cwd: str | None = None,
    url: str | None = None,
    headers: dict[str, str] | None = None,
    tool_timeout: int | None = None,
    enabled_tools: list[str] | None = None,
) -> McpPreset:
    presets: list[McpPreset] = list(getattr(config, "mcp_presets", []) or [])
    existing = find_preset(config, preset_id) if preset_id else None

    if existing is None:
        new_id = slugify(preset_id or label or command or url or "mcp")
        base = new_id
        n = 2
        while any(p.id == new_id for p in presets):
            new_id = f"{base}-{n}"
            n += 1
        merged_headers = dict(headers or {})
        preset = McpPreset(
            id=new_id,
            label=(label or new_id).strip() or new_id,
            enabled=bool(enabled) if enabled is not None else False,
            type=type,  # type: ignore[arg-type]
            command=(command or "").strip(),
            args=list(args or []),
            env=dict(env or {}),
            cwd=(cwd or "").strip(),
            url=(url or "").strip(),
            headers=merged_headers,
            tool_timeout=int(tool_timeout) if tool_timeout is not None else 30,
            enabled_tools=list(enabled_tools) if enabled_tools is not None else ["*"],
        )
        try:
            infer_transport(preset)
        except McpPresetError as exc:
            raise McpPresetError(str(exc)) from exc
        presets.append(preset)
        config.mcp_presets = presets
        return preset

    data = existing.model_dump()
    if label is not None:
        data["label"] = label.strip() or existing.id
    if enabled is not None:
        data["enabled"] = bool(enabled)
    if type is not None:
        data["type"] = type or None
    if command is not None:
        data["command"] = command.strip()
    if args is not None:
        data["args"] = list(args)
    if env is not None:
        data["env"] = dict(env)
    if cwd is not None:
        data["cwd"] = cwd.strip()
    if url is not None:
        data["url"] = url.strip()
    if headers is not None:
        merged = dict(existing.headers)
        for key, value in headers.items():
            if value == "" and key in merged:
                continue  # empty = keep
            merged[key] = value
        data["headers"] = merged
    if tool_timeout is not None:
        data["tool_timeout"] = int(tool_timeout)
    if enabled_tools is not None:
        data["enabled_tools"] = list(enabled_tools)
    updated = McpPreset.model_validate(data)
    try:
        infer_transport(updated)
    except McpPresetError as exc:
        raise McpPresetError(str(exc)) from exc
    config.mcp_presets = [updated if p.id == existing.id else p for p in presets]
    return updated


def delete_mcp_preset(config: Any, preset_id: str) -> McpPreset:
    presets: list[McpPreset] = list(getattr(config, "mcp_presets", []) or [])
    found = find_preset(config, preset_id)
    if found is None:
        raise McpPresetError(f"mcp preset not found: {preset_id}")
    config.mcp_presets = [p for p in presets if p.id != preset_id]
    return found


def set_mcp_enabled(config: Any, preset_id: str, enabled: bool) -> McpPreset:
    found = find_preset(config, preset_id)
    if found is None:
        raise McpPresetError(f"mcp preset not found: {preset_id}")
    return upsert_mcp_preset(config, preset_id=preset_id, enabled=enabled)


# Quick-start templates for Dev UI (api key left blank for user to fill).
MCP_TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "context7-stdio",
        "label": "Context7 (stdio / npx)",
        "hint": "Run @upstash/context7-mcp via npx; optional API key (--api-key) for higher limits.",
        "preset": {
            "id": "context7",
            "label": "Context7",
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@upstash/context7-mcp@latest"],
            "env": {},
            "url": "",
            "headers": {},
            "tool_timeout": 60,
            "enabled_tools": ["*"],
            "enabled": False,
        },
        "api_key_field": "args_api_key",
        "sample_invoke": {
            "tool_hint": "resolve-library-id",
            "arguments": {"libraryName": "react"},
        },
    },
    {
        "id": "context7-http",
        "label": "Context7 (remote HTTP)",
        "hint": "Remote HTTP MCP at mcp.context7.com; set CONTEXT7_API_KEY in headers.",
        "preset": {
            "id": "context7",
            "label": "Context7 HTTP",
            "type": "streamableHttp",
            "command": "",
            "args": [],
            "url": "https://mcp.context7.com/mcp",
            "headers": {"CONTEXT7_API_KEY": ""},
            "tool_timeout": 60,
            "enabled_tools": ["*"],
            "enabled": False,
        },
        "api_key_field": "headers.CONTEXT7_API_KEY",
        "sample_invoke": {
            "tool_hint": "resolve-library-id",
            "arguments": {"libraryName": "react"},
        },
    },
    {
        "id": "filesystem",
        "label": "Filesystem (stdio)",
        "hint": "Official filesystem MCP; default root is /tmp.",
        "preset": {
            "id": "fs",
            "label": "Filesystem",
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            "url": "",
            "headers": {},
            "tool_timeout": 30,
            "enabled_tools": ["*"],
            "enabled": False,
        },
        "sample_invoke": {
            "tool_hint": "list_directory",
            "arguments": {"path": "/tmp"},
        },
    },
]


def list_mcp_templates() -> list[dict[str, Any]]:
    return list(MCP_TEMPLATES)


def apply_template_api_key(template_id: str, preset: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Return a copy of template preset with api_key injected."""
    data = dict(preset)
    key = (api_key or "").strip()
    if not key:
        return data
    if template_id == "context7-stdio":
        args = list(data.get("args") or [])
        if "--api-key" not in args:
            args.extend(["--api-key", key])
        else:
            i = args.index("--api-key")
            if i + 1 < len(args):
                args[i + 1] = key
            else:
                args.append(key)
        data["args"] = args
    elif template_id == "context7-http":
        headers = dict(data.get("headers") or {})
        headers["CONTEXT7_API_KEY"] = key
        data["headers"] = headers
    return data
