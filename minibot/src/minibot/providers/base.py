"""LLM provider abstractions."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class ToolCallRequest:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(slots=True)
class LLMResponse:
    content: str | None = None
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    finish_reason: str = "stop"
    usage: dict[str, Any] | None = None
    reasoning: str | None = None

    @property
    def has_tool_calls(self) -> bool:
        return bool(self.tool_calls)


@dataclass(slots=True)
class TextDelta:
    text: str


@dataclass(slots=True)
class ReasoningDelta:
    text: str


@dataclass(slots=True)
class ToolCallDelta:
    id: str
    name: str
    arguments_delta: str = ""


@dataclass(slots=True)
class UsageEnd:
    usage: dict[str, Any]


@dataclass(slots=True)
class StreamEnd:
    finish_reason: str = "stop"
    content: str | None = None
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    reasoning: str | None = None
    usage: dict[str, Any] | None = None


StreamEvent = TextDelta | ReasoningDelta | ToolCallDelta | UsageEnd | StreamEnd


class LLMProvider(ABC):
    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> LLMResponse:
        raise NotImplementedError

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> AsyncIterator[StreamEvent]:
        """Default: one-shot ``chat`` then emit synthetic deltas + StreamEnd."""
        response = await self.chat(
            messages,
            tools=tools,
            model=model,
            temperature=temperature,
        )
        if response.reasoning:
            yield ReasoningDelta(text=response.reasoning)
        if response.content:
            yield TextDelta(text=response.content)
        if response.usage:
            yield UsageEnd(usage=response.usage)
        yield StreamEnd(
            finish_reason=response.finish_reason,
            content=response.content,
            tool_calls=list(response.tool_calls),
            reasoning=response.reasoning,
            usage=response.usage,
        )


async def aggregate_stream(events: AsyncIterator[StreamEvent]) -> LLMResponse:
    """Fold a stream into a single LLMResponse (for chat() adapters)."""
    content_parts: list[str] = []
    reasoning_parts: list[str] = []
    tool_calls: list[ToolCallRequest] = []
    finish = "stop"
    usage: dict[str, Any] | None = None
    async for ev in events:
        if isinstance(ev, TextDelta):
            content_parts.append(ev.text)
        elif isinstance(ev, ReasoningDelta):
            reasoning_parts.append(ev.text)
        elif isinstance(ev, UsageEnd):
            usage = ev.usage
        elif isinstance(ev, StreamEnd):
            finish = ev.finish_reason
            if ev.tool_calls:
                tool_calls = list(ev.tool_calls)
            if ev.content is not None and not content_parts:
                content_parts.append(ev.content)
            if ev.reasoning and not reasoning_parts:
                reasoning_parts.append(ev.reasoning)
            if ev.usage:
                usage = ev.usage
    return LLMResponse(
        content="".join(content_parts) or None,
        tool_calls=tool_calls,
        finish_reason=finish,
        usage=usage,
        reasoning="".join(reasoning_parts) or None,
    )
