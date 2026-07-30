"""Built-in echo tool for smoke tests."""

from __future__ import annotations

from typing import Any

from minibot.agent.tools.base import Tool


class EchoTool(Tool):
    name = "echo"
    description = "Echo back the provided text. Use to verify tool calling works."

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Text to echo back"},
            },
            "required": ["text"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        text = str(kwargs.get("text", ""))
        return f"echo: {text}"
