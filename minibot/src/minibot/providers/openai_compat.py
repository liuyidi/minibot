"""OpenAI-compatible chat completions provider."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

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


def extract_usage(data: dict[str, Any]) -> dict[str, Any] | None:
    """Normalize OpenAI-style ``usage`` from a chat.completions body."""
    raw = data.get("usage")
    if not isinstance(raw, dict) or not raw:
        return None
    out: dict[str, Any] = {}
    for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
        if key in raw and raw[key] is not None:
            out[key] = raw[key]
    if not out and isinstance(raw.get("input_tokens"), (int, float)):
        out["prompt_tokens"] = int(raw["input_tokens"])
    if "completion_tokens" not in out and isinstance(raw.get("output_tokens"), (int, float)):
        out["completion_tokens"] = int(raw["output_tokens"])
    return out or None


def _parse_tool_calls_message(message: dict[str, Any]) -> list[ToolCallRequest]:
    tool_calls: list[ToolCallRequest] = []
    for raw in message.get("tool_calls") or []:
        fn = raw.get("function") or {}
        args_raw = fn.get("arguments") or "{}"
        try:
            args = json.loads(args_raw) if isinstance(args_raw, str) else (args_raw or {})
        except json.JSONDecodeError:
            args = {"_raw": args_raw}
        if not isinstance(args, dict):
            args = {"value": args}
        tool_calls.append(
            ToolCallRequest(
                id=str(raw.get("id") or f"call_{len(tool_calls)}"),
                name=str(fn.get("name") or ""),
                arguments=args,
            )
        )
    return tool_calls


def _reasoning_from_delta(delta: dict[str, Any]) -> str | None:
    for key in ("reasoning_content", "reasoning", "thinking"):
        val = delta.get(key)
        if isinstance(val, str) and val:
            return val
    return None


def parse_sse_data_payload(data: str) -> dict[str, Any] | None:
    """Parse one SSE data payload to JSON object; None for [DONE]/empty."""
    payload = data.strip()
    if not payload or payload == "[DONE]":
        return None
    try:
        chunk = json.loads(payload)
    except json.JSONDecodeError:
        return None
    return chunk if isinstance(chunk, dict) else None


class OpenAICompatProvider(LLMProvider):
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1") -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> LLMResponse:
        if not self.api_key:
            return LLMResponse(
                content=(
                    "No API key configured. Set MINIBOT_SERVER_OPENAI_API_KEY "
                    "or OPENAI_API_KEY, then retry."
                ),
                finish_reason="error",
            )

        payload: dict[str, Any] = {"model": model, "messages": messages}
        if temperature is not None:
            payload["temperature"] = temperature
        if tools:
            payload["tools"] = tools

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.base_url}/chat/completions"
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code >= 400:
                detail = res.text[:500]
                return LLMResponse(
                    content=f"LLM error HTTP {res.status_code}: {detail}",
                    finish_reason="error",
                )
            data = res.json()

        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        finish = choice.get("finish_reason") or "stop"
        content = message.get("content")
        reasoning = None
        for key in ("reasoning_content", "reasoning", "thinking"):
            if isinstance(message.get(key), str) and message[key]:
                reasoning = message[key]
                break
        return LLMResponse(
            content=content,
            tool_calls=_parse_tool_calls_message(message),
            finish_reason=finish,
            usage=extract_usage(data if isinstance(data, dict) else {}),
            reasoning=reasoning,
        )

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        model: str,
        temperature: float | None = None,
    ) -> AsyncIterator[StreamEvent]:
        if not self.api_key:
            yield StreamEnd(
                finish_reason="error",
                content=(
                    "No API key configured. Set MINIBOT_SERVER_OPENAI_API_KEY "
                    "or OPENAI_API_KEY, then retry."
                ),
            )
            return

        payload: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
        if temperature is not None:
            payload["temperature"] = temperature
        if tools:
            payload["tools"] = tools
        payload["stream_options"] = {"include_usage": True}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        url = f"{self.base_url}/chat/completions"

        content_parts: list[str] = []
        reasoning_parts: list[str] = []
        tool_acc: dict[int, dict[str, str]] = {}
        finish_reason = "stop"
        usage: dict[str, Any] | None = None

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as res:
                if res.status_code >= 400:
                    body = (await res.aread()).decode("utf-8", errors="replace")[:500]
                    yield StreamEnd(
                        finish_reason="error",
                        content=f"LLM error HTTP {res.status_code}: {body}",
                    )
                    return
                async for line in res.aiter_lines():
                    if not line or line.startswith(":"):
                        continue
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].lstrip()
                    if data.strip() == "[DONE]":
                        break
                    chunk = parse_sse_data_payload(data)
                    if chunk is None:
                        continue
                    chunk_usage = extract_usage(chunk)
                    if chunk_usage:
                        usage = chunk_usage
                    choices = chunk.get("choices") or []
                    if not choices:
                        if chunk_usage:
                            yield UsageEnd(usage=chunk_usage)
                        continue
                    choice = choices[0] if isinstance(choices[0], dict) else {}
                    delta = choice.get("delta") or {}
                    if not isinstance(delta, dict):
                        delta = {}
                    fr = choice.get("finish_reason")
                    if fr:
                        finish_reason = str(fr)

                    reasoning = _reasoning_from_delta(delta)
                    if reasoning:
                        reasoning_parts.append(reasoning)
                        yield ReasoningDelta(text=reasoning)

                    text = delta.get("content")
                    if isinstance(text, str) and text:
                        content_parts.append(text)
                        yield TextDelta(text=text)

                    for tc in delta.get("tool_calls") or []:
                        if not isinstance(tc, dict):
                            continue
                        idx = int(tc.get("index") or 0)
                        slot = tool_acc.setdefault(idx, {"id": "", "name": "", "arguments": ""})
                        if tc.get("id"):
                            slot["id"] = str(tc["id"])
                        fn = tc.get("function") or {}
                        if isinstance(fn, dict):
                            if fn.get("name"):
                                slot["name"] = str(fn["name"])
                            if fn.get("arguments"):
                                slot["arguments"] += str(fn["arguments"])

        tool_calls: list[ToolCallRequest] = []
        for idx in sorted(tool_acc):
            slot = tool_acc[idx]
            args_raw = slot["arguments"] or "{}"
            try:
                args = json.loads(args_raw)
            except json.JSONDecodeError:
                args = {"_raw": args_raw}
            if not isinstance(args, dict):
                args = {"value": args}
            tool_calls.append(
                ToolCallRequest(
                    id=slot["id"] or f"call_{idx}",
                    name=slot["name"],
                    arguments=args,
                )
            )

        content = "".join(content_parts) or None
        reasoning_text = "".join(reasoning_parts) or None
        if tool_calls and finish_reason == "stop":
            finish_reason = "tool_calls"
        if usage:
            yield UsageEnd(usage=usage)
        yield StreamEnd(
            finish_reason=finish_reason,
            content=content,
            tool_calls=tool_calls,
            reasoning=reasoning_text,
            usage=usage,
        )
