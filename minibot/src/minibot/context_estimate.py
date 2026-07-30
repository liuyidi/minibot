"""Heuristic context-window usage estimate (chars/4, Claude-style breakdown)."""

from __future__ import annotations

import json
from typing import Any


def estimate_tokens(text: str) -> int:
    """Rough token estimate without a real tokenizer (~4 chars / token)."""
    if not text:
        return 0
    return max(1, (len(text) + 3) // 4)


def _json_size(value: Any) -> int:
    try:
        return estimate_tokens(json.dumps(value, ensure_ascii=False, default=str))
    except (TypeError, ValueError):
        return estimate_tokens(str(value))


def _message_tokens(messages: list[dict[str, Any]]) -> int:
    total = 0
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, str):
            total += estimate_tokens(content)
        elif content is not None:
            total += _json_size(content)
        if msg.get("tool_calls"):
            total += _json_size(msg["tool_calls"])
        # per-message framing overhead
        total += 4
    return total


def build_context_usage(
    *,
    messages: list[dict[str, Any]],
    system_prompt: str,
    tool_definitions: list[dict[str, Any]],
    context_window_tokens: int = 128_000,
    draft_text: str = "",
    mcp_tool_definitions: list[dict[str, Any]] | None = None,
    skills_text: str = "",
    memory_text: str = "",
) -> dict[str, Any]:
    """Build a Claude-like context usage breakdown for Dev UI."""
    window = max(1, int(context_window_tokens or 128_000))
    mcp_defs = mcp_tool_definitions or []

    system_tools = _json_size(tool_definitions) if tool_definitions else 0
    mcp_tools = _json_size(mcp_defs) if mcp_defs else 0
    sys_prompt = estimate_tokens(system_prompt)
    skills = estimate_tokens(skills_text)
    memory = estimate_tokens(memory_text)
    msgs = _message_tokens(messages)
    if draft_text.strip():
        msgs += estimate_tokens(draft_text.strip()) + 4

    categories_raw = [
        {
            "id": "system_tools",
            "label": "System tools",
            "tokens": system_tools,
            "count": len(tool_definitions),
            "color": "#5b8def",
        },
        {
            "id": "messages",
            "label": "Messages",
            "tokens": msgs,
            "count": len(messages) + (1 if draft_text.strip() else 0),
            "color": "#3ecf8e",
        },
        {
            "id": "mcp_tools",
            "label": "MCP tools",
            "tokens": mcp_tools,
            "count": len(mcp_defs),
            "color": "#e6a23c",
        },
        {
            "id": "system_prompt",
            "label": "System prompt",
            "tokens": sys_prompt,
            "count": 1 if system_prompt else 0,
            "color": "#9b7bff",
        },
        {
            "id": "skills",
            "label": "Skills",
            "tokens": skills,
            "count": 1 if skills_text.strip() else 0,
            "color": "#2bb8a7",
        },
        {
            "id": "memory",
            "label": "Memory files",
            "tokens": memory,
            "count": 1 if memory_text.strip() else 0,
            "color": "#e6b84d",
        },
    ]

    used = sum(c["tokens"] for c in categories_raw)
    free = max(0, window - used)

    categories: list[dict[str, Any]] = []
    for c in categories_raw:
        categories.append(
            {
                **c,
                "pct": round(100.0 * c["tokens"] / window, 1),
            }
        )
    categories.append(
        {
            "id": "free",
            "label": "Free space",
            "tokens": free,
            "count": 0,
            "color": "#6b7280",
            "pct": round(100.0 * free / window, 1),
        }
    )

    return {
        "context_window_tokens": window,
        "used_tokens": used,
        "free_tokens": free,
        "used_pct": round(100.0 * used / window, 1),
        "estimate_method": "chars/4",
        "categories": categories,
    }


def format_token_short(n: int | float) -> str:
    """Format like Claude: 38.9k."""
    n = float(n)
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M".rstrip("0").rstrip(".")
    if n >= 1000:
        return f"{n / 1000:.1f}k".rstrip("0").rstrip(".")
    return str(int(n))
