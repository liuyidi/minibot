"""Tool registry with recent-call introspection for Dev UI."""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from typing import Any

from minibot.agent.approval import ApprovalPolicy
from minibot.agent.tools.base import Tool
from minibot.security.network import NetworkDeniedError
from minibot.security.workspace_access import WorkspaceBoundaryError

_RECENT_MAX = 40

# Capability groups for Dev UI (name → category id).
TOOL_CATEGORY_BY_NAME: dict[str, str] = {
    "read_file": "filesystem",
    "write_file": "filesystem",
    "edit_file": "filesystem",
    "list_dir": "filesystem",
    "find_files": "search",
    "grep": "search",
    "exec": "shell",
    "web_fetch": "web",
    "web_search": "web",
    "spawn": "agent",
    "read_memory": "misc",
    "write_memory": "misc",
    "echo": "misc",
    "kb_list": "knowledge",
    "kb_search": "knowledge",
    "kb_answer": "knowledge",
}

TOOL_CATEGORY_LABELS: dict[str, str] = {
    "filesystem": "文件系统",
    "search": "搜索",
    "shell": "Shell",
    "web": "网络",
    "knowledge": "知识库",
    "agent": "子 Agent",
    "mcp": "MCP",
    "misc": "其它",
}

TOOL_CATEGORY_ORDER = (
    "filesystem",
    "search",
    "shell",
    "web",
    "knowledge",
    "agent",
    "mcp",
    "misc",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _deny_reason(exc: BaseException) -> str | None:
    reason = getattr(exc, "deny_reason", None)
    if isinstance(reason, str):
        return reason
    if isinstance(exc, WorkspaceBoundaryError):
        return "workspace"
    if isinstance(exc, NetworkDeniedError):
        return "ssrf"
    return None


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}
        self._recent: deque[dict[str, Any]] = deque(maxlen=_RECENT_MAX)
        self.approval_policy = ApprovalPolicy()

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def unregister(self, name: str) -> bool:
        return self._tools.pop(name, None) is not None

    def unregister_prefix(self, prefix: str) -> list[str]:
        removed = [name for name in list(self._tools) if name.startswith(prefix)]
        for name in removed:
            self._tools.pop(name, None)
        return removed

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def approval_required(self, name: str, arguments: dict[str, Any]) -> tuple[bool, str, str]:
        tool = self._tools.get(name)
        if tool is None:
            return False, "", "unknown"
        return self.approval_policy.check(tool, arguments)

    def get_definitions(self) -> list[dict[str, Any]]:
        return [tool.to_openai_schema() for tool in self._tools.values()]

    def list_meta(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for tool in self._tools.values():
            source = getattr(tool, "source", "builtin")
            cat = getattr(tool, "category", None)
            if not cat:
                if source == "mcp" or str(tool.name).startswith("mcp_"):
                    cat = "mcp"
                else:
                    cat = TOOL_CATEGORY_BY_NAME.get(tool.name, "misc")
            items.append(
                {
                    "name": tool.name,
                    "description": tool.description,
                    "risk": getattr(tool, "risk", "unknown"),
                    "approval_mode": getattr(tool, "approval_mode", "policy"),
                    "source": source,
                    "category": cat,
                    "category_label": TOOL_CATEGORY_LABELS.get(cat, cat),
                    "server": getattr(tool, "server_name", None),
                }
            )
        return sorted(
            items,
            key=lambda x: (
                TOOL_CATEGORY_ORDER.index(x["category"])
                if x["category"] in TOOL_CATEGORY_ORDER
                else 99,
                x["name"],
            ),
        )

    def categories_snapshot(self) -> list[dict[str, Any]]:
        """Grouped tool meta for Dev UI."""
        buckets: dict[str, list[dict[str, Any]]] = {c: [] for c in TOOL_CATEGORY_ORDER}
        extra: dict[str, list[dict[str, Any]]] = {}
        for item in self.list_meta():
            cat = str(item.get("category") or "misc")
            if cat in buckets:
                buckets[cat].append(item)
            else:
                extra.setdefault(cat, []).append(item)
        out: list[dict[str, Any]] = []
        for cat in TOOL_CATEGORY_ORDER:
            tools = buckets[cat]
            if not tools:
                continue
            out.append(
                {
                    "id": cat,
                    "label": TOOL_CATEGORY_LABELS.get(cat, cat),
                    "count": len(tools),
                    "tools": tools,
                }
            )
        for cat, tools in sorted(extra.items()):
            out.append(
                {
                    "id": cat,
                    "label": TOOL_CATEGORY_LABELS.get(cat, cat),
                    "count": len(tools),
                    "tools": tools,
                }
            )
        return out

    def recent_calls(self) -> list[dict[str, Any]]:
        return list(self._recent)

    def snapshot(self) -> dict[str, Any]:
        return {
            "tools": self.list_meta(),
            "categories": self.categories_snapshot(),
            "recent": self.recent_calls(),
            "count": len(self._tools),
        }

    async def execute(self, name: str, arguments: dict[str, Any]) -> str:
        tool = self._tools.get(name)
        if tool is None:
            msg = f"Error: unknown tool {name!r}"
            self._record(name, ok=False, denied_reason="unknown", result=msg, arguments=arguments)
            return msg
        try:
            result = await tool.execute(**arguments)
            self._record(name, ok=True, denied_reason=None, result=result, arguments=arguments)
            return result
        except TypeError as exc:
            msg = f"Error: invalid arguments for {name}: {exc}"
            self._record(name, ok=False, denied_reason=None, result=msg, arguments=arguments)
            return msg
        except (WorkspaceBoundaryError, NetworkDeniedError) as exc:
            msg = f"Error: {type(exc).__name__}: {exc}"
            self._record(
                name,
                ok=False,
                denied_reason=_deny_reason(exc),
                result=msg,
                arguments=arguments,
            )
            return msg
        except Exception as exc:
            msg = f"Error: {type(exc).__name__}: {exc}"
            self._record(name, ok=False, denied_reason=None, result=msg, arguments=arguments)
            return msg

    def _record(
        self,
        name: str,
        *,
        ok: bool,
        denied_reason: str | None,
        result: str,
        arguments: dict[str, Any],
    ) -> None:
        preview = result if len(result) <= 240 else result[:240] + "…"
        args_preview = str(arguments)
        if len(args_preview) > 200:
            args_preview = args_preview[:200] + "…"
        self._recent.appendleft(
            {
                "ts": _now_iso(),
                "name": name,
                "ok": ok,
                "denied": denied_reason is not None,
                "denied_reason": denied_reason,
                "arguments": args_preview,
                "result_preview": preview,
            }
        )

    def __len__(self) -> int:
        return len(self._tools)

    def names(self) -> list[str]:
        return sorted(self._tools)
