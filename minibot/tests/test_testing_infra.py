"""Smoke tests for shared testing infrastructure."""

from __future__ import annotations

import asyncio
from typing import Any

from fake_provider import FakeProvider, streaming_text, text_response, tool_response
from helpers import assert_ws_events, collect_stream, run_concurrent


def test_fake_provider_sequences_chat_calls() -> None:
    provider = FakeProvider(
        responses=[
            tool_response("echo", {"text": "x"}),
            text_response("done"),
        ]
    )

    async def _run() -> None:
        first = await provider.chat([{"role": "user", "content": "a"}], model="m")
        second = await provider.chat([{"role": "user", "content": "b"}], model="m")
        assert first.has_tool_calls
        assert second.content == "done"
        assert len(provider.calls) == 2

    asyncio.run(_run())


def test_fake_provider_stream_script() -> None:
    provider = FakeProvider(streams=[streaming_text(["a", "b"])])

    async def _run() -> None:
        deltas = await collect_stream(provider, messages=[{"role": "user", "content": "hi"}])
        events = [d.event for d in deltas]
        assert events == ["delta", "delta", "stream_end"]
        assert "".join(d.text for d in deltas if d.event == "delta") == "ab"

    asyncio.run(_run())


def test_assert_ws_events_matches_subset() -> None:
    frames: list[dict[str, Any]] = [
        {"event": "ready", "ok": True},
        {"event": "delta", "text": "Hi", "stream_id": "s1"},
        {"event": "stream_end", "stream_id": "s1"},
    ]
    assert_ws_events(
        frames,
        [
            ("ready", None),
            ("delta", {"text": "Hi"}),
            ("stream_end", None),
        ],
    )


def test_fake_trace_fixture_shape(fake_trace: list[dict[str, Any]]) -> None:
    types = [s["type"] for s in fake_trace]
    assert types[0] == "prepare"
    assert types[-1] == "done"
    assert any(s["type"] == "llm_final" for s in fake_trace)


def test_run_concurrent_helper() -> None:
    async def _one(n: int) -> int:
        await asyncio.sleep(0)
        return n

    async def _run() -> None:
        out = await run_concurrent([_one(1), _one(2), _one(3)])
        assert out == [1, 2, 3]

    asyncio.run(_run())


def test_data_dir_isolated(data_dir, fake_provider: FakeProvider) -> None:
    assert data_dir.exists()
    assert fake_provider.responses
