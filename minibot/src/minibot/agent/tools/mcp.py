"""MCP client manager: connect servers and inject tools into ToolRegistry."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import time
from collections import deque
from contextlib import AsyncExitStack, suppress
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

from minibot.agent.tools.base import Tool
from minibot.agent.tools.registry import ToolRegistry
from minibot.config.mcp_presets import McpPreset, infer_transport
from minibot.security.network import validate_url_target

logger = logging.getLogger(__name__)

_SANITIZE_RE = re.compile(r"_+")
_EVENTS_MAX = 120
_CALLS_MAX = 40
_WINDOWS_SHELL_LAUNCHERS = frozenset(("npx", "npm", "pnpm", "yarn", "bunx"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_name(name: str) -> str:
    return _SANITIZE_RE.sub("_", re.sub(r"[^a-zA-Z0-9_-]", "_", name))


def tool_prefix(server_id: str) -> str:
    return f"mcp_{sanitize_name(server_id)}_"


def _normalize_windows_stdio_command(
    command: str,
    args: list[str] | None,
    env: dict[str, str] | None,
) -> tuple[str, list[str], dict[str, str] | None]:
    normalized_args = list(args or [])
    if os.name != "nt":
        return command, normalized_args, env
    basename = command.replace("\\", "/").rsplit("/", maxsplit=1)[-1].lower()
    if basename in {"cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe"}:
        return command, normalized_args, env
    if basename.endswith((".exe", ".com")):
        return command, normalized_args, env
    resolved = shutil.which(command, path=(env or {}).get("PATH")) or command
    resolved_basename = resolved.replace("\\", "/").rsplit("/", maxsplit=1)[-1].lower()
    should_wrap = (
        basename in _WINDOWS_SHELL_LAUNCHERS
        or basename.endswith((".cmd", ".bat"))
        or resolved_basename.endswith((".cmd", ".bat"))
    )
    if not should_wrap:
        return command, normalized_args, env
    comspec = (env or {}).get("COMSPEC") or os.environ.get("COMSPEC") or "cmd.exe"
    return comspec, ["/d", "/c", command, *normalized_args], env


def _normalize_schema_for_openai(schema: Any) -> dict[str, Any]:
    if not isinstance(schema, dict):
        return {"type": "object", "properties": {}}
    normalized = dict(schema)
    raw_type = normalized.get("type")
    if isinstance(raw_type, list):
        non_null = [item for item in raw_type if item != "null"]
        if "null" in raw_type and len(non_null) == 1:
            normalized["type"] = non_null[0]
            normalized["nullable"] = True
    if "properties" in normalized and isinstance(normalized["properties"], dict):
        normalized["properties"] = {
            name: _normalize_schema_for_openai(prop) if isinstance(prop, dict) else prop
            for name, prop in normalized["properties"].items()
        }
    if "items" in normalized and isinstance(normalized["items"], dict):
        normalized["items"] = _normalize_schema_for_openai(normalized["items"])
    return normalized


async def _probe_http_url(url: str, timeout: float = 3.0) -> bool:
    parsed = httpx.URL(url)
    host = parsed.host or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=timeout)
        writer.close()
        with suppress(OSError, asyncio.TimeoutError):
            await asyncio.wait_for(writer.wait_closed(), timeout=0.2)
        return True
    except (OSError, asyncio.TimeoutError):
        return False


async def _validate_mcp_request_url(request: httpx.Request) -> None:
    ok, error = validate_url_target(str(request.url))
    if not ok:
        raise httpx.RequestError(
            f"Blocked unsafe MCP URL {request.url} ({error})",
            request=request,
        )


class MCPToolWrapper(Tool):
    """Wrap one MCP tool as a minibot Tool."""

    source = "mcp"
    category = "mcp"
    risk = "mcp"

    def __init__(
        self,
        session: Any,
        server_name: str,
        tool_def: Any,
        tool_timeout: int = 30,
        *,
        manager: McpManager | None = None,
    ):
        self._session = session
        self._manager = manager
        self.server_name = server_name
        self._original_name = tool_def.name
        self.name = sanitize_name(f"mcp_{server_name}_{tool_def.name}")
        self.description = tool_def.description or tool_def.name
        raw_schema = tool_def.inputSchema or {"type": "object", "properties": {}}
        self._parameters = _normalize_schema_for_openai(raw_schema)
        self._tool_timeout = tool_timeout

    def parameters_schema(self) -> dict[str, Any]:
        return self._parameters

    async def execute(self, **kwargs: Any) -> str:
        from mcp import types

        t0 = time.perf_counter()
        if self._manager is not None:
            self._manager.record_pipeline(
                "call_tool_start",
                server_id=self.server_name,
                detail=self.name,
                ok=None,
                payload={
                    "tool": self.name,
                    "original": self._original_name,
                    "arguments": kwargs,
                    "source": "agent_or_invoke",
                },
            )
        try:
            result = await asyncio.wait_for(
                self._session.call_tool(self._original_name, arguments=kwargs),
                timeout=self._tool_timeout,
            )
        except asyncio.TimeoutError:
            msg = f"(MCP tool call timed out after {self._tool_timeout}s)"
            if self._manager is not None:
                self._manager.record_call(
                    server_id=self.server_name,
                    tool=self.name,
                    original=self._original_name,
                    arguments=kwargs,
                    result=msg,
                    ok=False,
                    duration_ms=int((time.perf_counter() - t0) * 1000),
                    error="timeout",
                )
            return msg
        except Exception as exc:  # noqa: BLE001 — surface to model
            logger.exception("MCP tool %s failed", self.name)
            msg = f"(MCP tool call failed: {type(exc).__name__}: {exc})"
            if self._manager is not None:
                self._manager.record_call(
                    server_id=self.server_name,
                    tool=self.name,
                    original=self._original_name,
                    arguments=kwargs,
                    result=msg,
                    ok=False,
                    duration_ms=int((time.perf_counter() - t0) * 1000),
                    error=f"{type(exc).__name__}: {exc}",
                )
            return msg

        parts: list[str] = []
        for block in result.content:
            if isinstance(block, types.TextContent):
                parts.append(block.text)
            else:
                parts.append(str(block))
        out = "\n".join(parts) or "(no output)"
        if self._manager is not None:
            self._manager.record_call(
                server_id=self.server_name,
                tool=self.name,
                original=self._original_name,
                arguments=kwargs,
                result=out,
                ok=True,
                duration_ms=int((time.perf_counter() - t0) * 1000),
                error=None,
            )
        return out


@dataclass
class ServerRuntime:
    preset_id: str
    connected: bool = False
    transport: str = ""
    tool_names: list[str] = field(default_factory=list)
    tool_catalog: list[dict[str, Any]] = field(default_factory=list)
    last_error: str | None = None
    connected_at: str | None = None


class McpManager:
    """Owns MCP connections and registry tool injection."""

    def __init__(self, registry: ToolRegistry) -> None:
        self.registry = registry
        self._stacks: dict[str, AsyncExitStack] = {}
        self._status: dict[str, ServerRuntime] = {}
        self._events: deque[dict[str, Any]] = deque(maxlen=_EVENTS_MAX)
        self._pipeline: deque[dict[str, Any]] = deque(maxlen=_EVENTS_MAX)
        self._calls: deque[dict[str, Any]] = deque(maxlen=_CALLS_MAX)
        self._lock = asyncio.Lock()

    def _emit(self, kind: str, *, server_id: str = "", detail: str = "", ok: bool | None = None) -> None:
        self._events.appendleft(
            {
                "ts": _now_iso(),
                "kind": kind,
                "server_id": server_id,
                "detail": detail,
                "ok": ok,
            }
        )

    def record_pipeline(
        self,
        stage: str,
        *,
        server_id: str = "",
        detail: str = "",
        ok: bool | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        entry = {
            "ts": _now_iso(),
            "stage": stage,
            "server_id": server_id,
            "detail": detail,
            "ok": ok,
            "payload": payload or {},
        }
        self._pipeline.appendleft(entry)
        self._emit(stage, server_id=server_id, detail=detail, ok=ok)

    def record_call(
        self,
        *,
        server_id: str,
        tool: str,
        original: str,
        arguments: dict[str, Any],
        result: str,
        ok: bool,
        duration_ms: int,
        error: str | None,
    ) -> None:
        preview = result if len(result) <= 2000 else result[:2000] + "…"
        call = {
            "ts": _now_iso(),
            "server_id": server_id,
            "tool": tool,
            "original": original,
            "arguments": arguments,
            "result": preview,
            "ok": ok,
            "duration_ms": duration_ms,
            "error": error,
        }
        self._calls.appendleft(call)
        self.record_pipeline(
            "call_tool_end",
            server_id=server_id,
            detail=f"{tool} {duration_ms}ms",
            ok=ok,
            payload=call,
        )

    def snapshot(self) -> dict[str, Any]:
        servers = []
        for sid, st in sorted(self._status.items()):
            servers.append(
                {
                    "id": sid,
                    "connected": st.connected,
                    "transport": st.transport,
                    "tool_count": len(st.tool_names),
                    "tools": list(st.tool_names),
                    "tool_catalog": list(st.tool_catalog),
                    "last_error": st.last_error,
                    "connected_at": st.connected_at,
                }
            )
        mcp_tools = [
            m for m in self.registry.list_meta() if m.get("source") == "mcp" or m.get("category") == "mcp"
        ]
        return {
            "ok": True,
            "servers": servers,
            "injected_tools": mcp_tools,
            "events": list(self._events),
            "pipeline": list(self._pipeline),
            "calls": list(self._calls),
        }

    async def start(self, presets: list[McpPreset]) -> None:
        for preset in presets:
            if not preset.enabled:
                continue
            await self.connect(preset)

    async def stop(self) -> None:
        for server_id in list(self._stacks.keys()):
            await self.disconnect(server_id)

    async def connect(self, preset: McpPreset) -> dict[str, Any]:
        async with self._lock:
            return await self._connect_unlocked(preset, register=True)

    async def disconnect(self, server_id: str) -> dict[str, Any]:
        async with self._lock:
            return await self._disconnect_unlocked(server_id)

    async def test(self, preset: McpPreset) -> dict[str, Any]:
        """Temporary connect + list tools; does not leave tools in registry."""
        async with self._lock:
            probe = preset.model_copy(deep=True)
            probe.id = f"__test_{preset.id or 'probe'}"
            result = await self._connect_unlocked(probe, register=False)
            await self._disconnect_unlocked(probe.id, emit=False)
            return {
                "ok": result.get("ok", False),
                "transport": result.get("transport"),
                "tools": result.get("tools") or [],
                "error": result.get("error"),
                "pipeline": list(self._pipeline)[:20],
            }

    async def invoke(
        self,
        server_id: str,
        tool: str,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Manually call an injected MCP tool (Dev UI probe)."""
        args = dict(arguments or {})
        st = self._status.get(server_id)
        if st is None or not st.connected:
            return {"ok": False, "error": f"server not connected: {server_id}"}

        resolved = tool
        if resolved not in self.registry._tools:
            # Allow original MCP name or suffix match.
            candidates = [
                n
                for n in st.tool_names
                if n == tool or n.endswith(f"_{sanitize_name(tool)}") or n.endswith(f"_{tool}")
            ]
            catalog_hit = next(
                (
                    c
                    for c in st.tool_catalog
                    if c.get("original") == tool or c.get("name") == tool
                ),
                None,
            )
            if catalog_hit:
                resolved = str(catalog_hit["name"])
            elif len(candidates) == 1:
                resolved = candidates[0]
            elif candidates:
                return {"ok": False, "error": f"ambiguous tool {tool}: {candidates}"}
            else:
                return {"ok": False, "error": f"tool not found: {tool}"}

        wrapper = self.registry.get(resolved)
        if wrapper is None or getattr(wrapper, "source", "") != "mcp":
            return {"ok": False, "error": f"not an MCP tool: {resolved}"}

        self.record_pipeline(
            "invoke_request",
            server_id=server_id,
            detail=resolved,
            ok=None,
            payload={"tool": resolved, "arguments": args, "source": "devui_invoke"},
        )
        # Use registry.execute so Tools recent-calls also updates.
        result = await self.registry.execute(resolved, args)
        last = self._calls[0] if self._calls else None
        return {
            "ok": bool(last and last.get("ok")) if last and last.get("tool") == resolved else True,
            "tool": resolved,
            "arguments": args,
            "result": result,
            "call": last,
            "pipeline": list(self._pipeline)[:30],
        }

    async def _disconnect_unlocked(self, server_id: str, *, emit: bool = True) -> dict[str, Any]:
        removed = self.registry.unregister_prefix(tool_prefix(server_id))
        stack = self._stacks.pop(server_id, None)
        if stack is not None:
            with suppress(Exception):
                await stack.aclose()
        st = self._status.get(server_id) or ServerRuntime(preset_id=server_id)
        st.connected = False
        st.tool_names = []
        st.tool_catalog = []
        self._status[server_id] = st
        if emit:
            self.record_pipeline(
                "disconnect",
                server_id=server_id,
                detail=f"removed {len(removed)} tools",
                ok=True,
            )
        return {"ok": True, "removed_tools": removed}

    async def _connect_unlocked(self, preset: McpPreset, *, register: bool) -> dict[str, Any]:
        server_id = preset.id
        await self._disconnect_unlocked(server_id, emit=False)

        st = ServerRuntime(preset_id=server_id)
        try:
            transport = infer_transport(preset)
        except Exception as exc:  # noqa: BLE001
            st.last_error = str(exc)
            self._status[server_id] = st
            self.record_pipeline("error", server_id=server_id, detail=st.last_error, ok=False)
            return {"ok": False, "error": st.last_error, "tools": []}

        st.transport = transport
        self.record_pipeline("connect_start", server_id=server_id, detail=transport, ok=None)

        server_stack = AsyncExitStack()
        await server_stack.__aenter__()
        try:
            self.record_pipeline("transport_open", server_id=server_id, detail=transport, ok=None)
            session, tool_defs = await self._open_session(preset, transport, server_stack)
            self.record_pipeline(
                "session_init",
                server_id=server_id,
                detail="ClientSession.initialize ok",
                ok=True,
            )
            raw_names = [t.name for t in tool_defs]
            self.record_pipeline(
                "list_tools",
                server_id=server_id,
                detail=f"{len(tool_defs)} tools",
                ok=True,
                payload={"tools": raw_names},
            )
            enabled_tools = set(preset.enabled_tools or ["*"])
            allow_all = "*" in enabled_tools
            wrappers: list[MCPToolWrapper] = []
            names: list[str] = []
            catalog: list[dict[str, Any]] = []
            for tool_def in tool_defs:
                wrapped = sanitize_name(f"mcp_{server_id}_{tool_def.name}")
                if (
                    not allow_all
                    and tool_def.name not in enabled_tools
                    and wrapped not in enabled_tools
                ):
                    continue
                wrapper = MCPToolWrapper(
                    session,
                    server_id,
                    tool_def,
                    tool_timeout=preset.tool_timeout or 30,
                    manager=self if register else None,
                )
                wrappers.append(wrapper)
                names.append(wrapper.name)
                catalog.append(
                    {
                        "name": wrapper.name,
                        "original": tool_def.name,
                        "description": wrapper.description,
                        "parameters": wrapper.parameters_schema(),
                    }
                )

            if register:
                for wrapper in wrappers:
                    self.registry.register(wrapper)
                self._stacks[server_id] = server_stack
                st.connected = True
                st.tool_names = names
                st.tool_catalog = catalog
                st.connected_at = _now_iso()
                st.last_error = None
                self._status[server_id] = st
                self.record_pipeline(
                    "inject",
                    server_id=server_id,
                    detail=f"{len(names)} tools",
                    ok=True,
                    payload={"tools": names},
                )
            else:
                with suppress(Exception):
                    await server_stack.aclose()
                self.record_pipeline(
                    "test_ok",
                    server_id=preset.id.removeprefix("__test_"),
                    detail=f"{len(names)} tools",
                    ok=True,
                    payload={"tools": names},
                )

            return {
                "ok": True,
                "transport": transport,
                "tools": [
                    {
                        "name": w.name,
                        "original": w._original_name,
                        "description": w.description,
                        "parameters": w.parameters_schema(),
                    }
                    for w in wrappers
                ],
                "error": None,
            }
        except Exception as exc:  # noqa: BLE001
            with suppress(Exception):
                await server_stack.aclose()
            hint = ""
            text = str(exc).lower()
            if any(
                marker in text
                for marker in ("parse error", "invalid json", "unexpected token", "jsonrpc")
            ):
                hint = (
                    " Hint: MCP stdio servers must write only JSON-RPC to stdout; "
                    "send logs to stderr."
                )
            st.last_error = f"{type(exc).__name__}: {exc}{hint}"
            st.connected = False
            st.tool_names = []
            st.tool_catalog = []
            self._status[server_id] = st
            self.record_pipeline("error", server_id=server_id, detail=st.last_error, ok=False)
            logger.exception("MCP server %s failed", server_id)
            return {"ok": False, "error": st.last_error, "tools": [], "transport": transport}

    async def _open_session(
        self,
        preset: McpPreset,
        transport: str,
        server_stack: AsyncExitStack,
    ) -> tuple[Any, list[Any]]:
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.sse import sse_client
        from mcp.client.stdio import stdio_client
        from mcp.client.streamable_http import streamable_http_client

        if transport in {"sse", "streamableHttp"}:
            ok, error = validate_url_target(preset.url)
            if not ok:
                raise RuntimeError(f"blocked unsafe URL {preset.url} ({error})")

        if transport == "stdio":
            command, args, env = _normalize_windows_stdio_command(
                preset.command,
                preset.args,
                preset.env or None,
            )
            params = StdioServerParameters(
                command=command,
                args=args,
                env=env,
                cwd=preset.cwd or None,
            )
            read, write = await server_stack.enter_async_context(stdio_client(params))
        elif transport == "sse":
            if not await _probe_http_url(preset.url):
                raise RuntimeError(f"unreachable URL {preset.url}")

            def httpx_client_factory(
                headers: dict[str, str] | None = None,
                timeout: httpx.Timeout | None = None,
                auth: httpx.Auth | None = None,
            ) -> httpx.AsyncClient:
                merged_headers = {
                    "Accept": "application/json, text/event-stream",
                    **(preset.headers or {}),
                    **(headers or {}),
                }
                return httpx.AsyncClient(
                    headers=merged_headers or None,
                    event_hooks={"request": [_validate_mcp_request_url]},
                    follow_redirects=True,
                    timeout=timeout,
                    auth=auth,
                )

            read, write = await server_stack.enter_async_context(
                sse_client(preset.url, httpx_client_factory=httpx_client_factory)
            )
        elif transport == "streamableHttp":
            if not await _probe_http_url(preset.url):
                raise RuntimeError(f"unreachable URL {preset.url}")
            http_client = await server_stack.enter_async_context(
                httpx.AsyncClient(
                    headers=preset.headers or None,
                    event_hooks={"request": [_validate_mcp_request_url]},
                    follow_redirects=True,
                    timeout=None,
                )
            )
            read, write, _ = await server_stack.enter_async_context(
                streamable_http_client(preset.url, http_client=http_client)
            )
        else:
            raise RuntimeError(f"unknown transport {transport}")

        session = await server_stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        tools = await session.list_tools()
        return session, list(tools.tools)
