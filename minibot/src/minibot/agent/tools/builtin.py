"""Register default coding-agent tools."""

from __future__ import annotations

from minibot.agent.tools.echo import EchoTool
from minibot.agent.tools.filesystem import EditFileTool, ListDirTool, ReadFileTool, WriteFileTool
from minibot.agent.tools.kb import KbAnswerTool, KbListTool, KbSearchTool
from minibot.agent.tools.memory_tools import ReadMemoryTool, WriteMemoryTool
from minibot.agent.tools.registry import ToolRegistry
from minibot.agent.tools.search import FindFilesTool, GrepTool
from minibot.agent.tools.shell import ExecTool
from minibot.agent.tools.web import WebFetchTool, WebSearchTool
from minibot.config.settings import get_settings


def register_default_tools(registry: ToolRegistry | None = None) -> ToolRegistry:
    """Register Phase 1 + 3b builtin tools. Weather is intentionally omitted (1.4)."""
    tools = registry or ToolRegistry()
    tools.register(EchoTool())
    tools.register(ReadFileTool())
    tools.register(WriteFileTool())
    tools.register(EditFileTool())
    tools.register(ListDirTool())
    tools.register(FindFilesTool())
    tools.register(GrepTool())
    tools.register(ExecTool())
    tools.register(WebFetchTool())
    tools.register(WebSearchTool())
    tools.register(ReadMemoryTool())
    tools.register(WriteMemoryTool())
    # Knowledge tools only when minikb is configured (so the model never sees dead tools).
    if (get_settings().minikb_base_url or "").strip():
        tools.register(KbListTool())
        tools.register(KbSearchTool())
        tools.register(KbAnswerTool())
    return tools


SYSTEM_PROMPT = (
    "You are minibot, a local coding assistant. "
    "You can read/write/edit files, list directories, search (find_files/grep), "
    "run shell commands (exec), fetch/search the web, manage long-term memory "
    "(read_memory/write_memory), and spawn focused subagents (spawn) — all scoped "
    "to the current workspace with security guards. "
    "When kb_list / kb_search / kb_answer are available, use them for questions about "
    "uploaded knowledge-base documents; always cite doc titles or chunk ids. "
    "Prefer tools for repository tasks; answer directly for general questions. "
    "Never try to escape the workspace boundary."
)
