"""Scriptable fake LLM provider for unit/API tests."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from minibot.providers.base import (
    LLMProvider,
    LLMResponse,
    ReasoningDelta,
    StreamEnd,
    StreamEvent,
    TextDelta,
    ToolCallRequest,
    UsageEnd,
)


@dataclass(slots=True)
class StreamDelta:
    """Legacy outbound stream frame used by older helpers/fixtures."""

    event: str  # delta | stream_end | reasoning_delta | reasoning_end
    text: str = ""
    stream_id: str = "s1"


@dataclass
class FakeProvider(LLMProvider):
    """Pop ``LLMResponse`` / stream scripts in order; record every call."""

    responses: list[LLMResponse] = field(default_factory=list)
    streams: list[list[StreamDelta]] = field(default_factory=list)
    calls: list[dict[str, Any]] = field(default_factory=list)
    stream_calls: list[dict[str, Any]] = field(default_factory=list)
    exhausted_error: str = "unexpected extra LLM call"
    stream_delay_s: float = 0.0

    def __post_init__(self) -> None:
        self.responses = list(self.responses)
        self.streams = [list(s) for s in self.streams]

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> LLMResponse:
        self.calls.append(
            {
                "messages": messages,
                "tools": tools,
                "model": model,
                "temperature": temperature,
            }
        )
        if not self.responses:
            return LLMResponse(content=self.exhausted_error, finish_reason="error")
        return self.responses.pop(0)

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> AsyncIterator[StreamEvent]:
        import asyncio

        self.stream_calls.append(
            {
                "messages": messages,
                "tools": tools,
                "model": model,
                "temperature": temperature,
            }
        )
        if self.streams:
            script = self.streams.pop(0)
            content_parts: list[str] = []
            reasoning_parts: list[str] = []
            for delta in script:
                if self.stream_delay_s > 0:
                    await asyncio.sleep(self.stream_delay_s)
                if delta.event == "delta" and delta.text:
                    content_parts.append(delta.text)
                    yield TextDelta(text=delta.text)
                elif delta.event == "reasoning_delta" and delta.text:
                    reasoning_parts.append(delta.text)
                    yield ReasoningDelta(text=delta.text)
            response = self.responses.pop(0) if self.responses else None
            if response is not None:
                if response.usage:
                    yield UsageEnd(usage=response.usage)
                yield StreamEnd(
                    finish_reason=response.finish_reason,
                    content=response.content or ("".join(content_parts) or None),
                    tool_calls=list(response.tool_calls),
                    reasoning=response.reasoning or ("".join(reasoning_parts) or None),
                    usage=response.usage,
                )
            else:
                yield StreamEnd(
                    finish_reason="stop",
                    content="".join(content_parts) or None,
                    reasoning="".join(reasoning_parts) or None,
                )
            return

        if not self.responses:
            yield StreamEnd(finish_reason="error", content=self.exhausted_error)
            return
        response = await self.chat(
            messages,
            tools=tools,
            model=model,
            temperature=temperature,
        )
        if response.reasoning:
            yield ReasoningDelta(text=response.reasoning)
        if response.content:
            # Split into small chunks for UX tests when delay set, else one chunk.
            text = response.content
            if self.stream_delay_s > 0 and len(text) > 1:
                for ch in text:
                    await asyncio.sleep(self.stream_delay_s)
                    yield TextDelta(text=ch)
            else:
                yield TextDelta(text=text)
        if response.usage:
            yield UsageEnd(usage=response.usage)
        yield StreamEnd(
            finish_reason=response.finish_reason,
            content=response.content,
            tool_calls=list(response.tool_calls),
            reasoning=response.reasoning,
            usage=response.usage,
        )

    async def iter_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> AsyncIterator[StreamDelta]:
        """Legacy helper: yield StreamDelta frames from chat_stream."""
        async for ev in self.chat_stream(
            messages,
            tools=tools,
            model=model,
            temperature=temperature,
        ):
            if isinstance(ev, TextDelta):
                yield StreamDelta(event="delta", text=ev.text)
            elif isinstance(ev, ReasoningDelta):
                yield StreamDelta(event="reasoning_delta", text=ev.text)
            elif isinstance(ev, StreamEnd):
                yield StreamDelta(event="stream_end")

    def push(self, *responses: LLMResponse) -> None:
        self.responses.extend(responses)

    def push_stream(self, deltas: list[StreamDelta]) -> None:
        self.streams.append(list(deltas))


def text_response(
    content: str,
    *,
    finish_reason: str = "stop",
    usage: dict[str, Any] | None = None,
    reasoning: str | None = None,
) -> LLMResponse:
    return LLMResponse(
        content=content,
        finish_reason=finish_reason,
        usage=usage,
        reasoning=reasoning,
    )


def tool_response(
    name: str,
    arguments: dict[str, Any],
    *,
    call_id: str = "call_1",
    content: str | None = None,
    usage: dict[str, Any] | None = None,
) -> LLMResponse:
    return LLMResponse(
        content=content,
        tool_calls=[ToolCallRequest(id=call_id, name=name, arguments=arguments)],
        finish_reason="tool_calls",
        usage=usage,
    )


def error_response(content: str = "Model error") -> LLMResponse:
    return LLMResponse(content=content, finish_reason="error")


def streaming_text(chunks: list[str], *, stream_id: str = "s1") -> list[StreamDelta]:
    deltas = [StreamDelta(event="delta", text=c, stream_id=stream_id) for c in chunks]
    deltas.append(StreamDelta(event="stream_end", stream_id=stream_id))
    return deltas


def streaming_reasoning(
    reasoning_chunks: list[str],
    answer_chunks: list[str],
    *,
    stream_id: str = "s1",
) -> list[StreamDelta]:
    deltas = [
        StreamDelta(event="reasoning_delta", text=c, stream_id=f"r-{stream_id}")
        for c in reasoning_chunks
    ]
    deltas.append(StreamDelta(event="reasoning_end", stream_id=f"r-{stream_id}"))
    deltas.extend(StreamDelta(event="delta", text=c, stream_id=stream_id) for c in answer_chunks)
    deltas.append(StreamDelta(event="stream_end", stream_id=stream_id))
    return deltas
