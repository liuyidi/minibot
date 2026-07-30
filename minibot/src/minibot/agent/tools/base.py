"""Minimal tool base class."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class Tool(ABC):
    name: str = "tool"
    description: str = ""
    risk: str = "unknown"
    source: str = "builtin"

    def parameters_schema(self) -> dict[str, Any]:
        return {"type": "object", "properties": {}, "additionalProperties": False}

    def to_openai_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters_schema(),
            },
        }

    @abstractmethod
    async def execute(self, **kwargs: Any) -> str:
        raise NotImplementedError
