"""Reusable test helpers (importable; keep fixtures in conftest)."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from typing import Any

from fake_provider import FakeProvider, StreamDelta


def assert_ws_events(
    received: Sequence[dict[str, Any]],
    expected: Sequence[tuple[str, dict[str, Any] | None]],
) -> None:
    """Assert WS frames by ``event`` name and optional field subset.

    Example::

        assert_ws_events(frames, [
            ("ready", None),
            ("delta", {"text": "Hi"}),
            ("stream_end", None),
        ])
    """
    assert len(received) >= len(expected), (
        f"expected at least {len(expected)} events, got {len(received)}: "
        f"{[r.get('event') for r in received]}"
    )
    for idx, (event_name, subset) in enumerate(expected):
        frame = received[idx]
        actual = frame.get("event") or frame.get("type")
        assert actual == event_name, f"event[{idx}]: expected {event_name!r}, got {actual!r} ({frame})"
        if subset:
            for key, value in subset.items():
                assert frame.get(key) == value, (
                    f"event[{idx}] field {key!r}: expected {value!r}, got {frame.get(key)!r}"
                )


async def collect_stream(provider: FakeProvider, **kwargs: Any) -> list[StreamDelta]:
    out: list[StreamDelta] = []
    async for item in provider.iter_stream(
        kwargs.get("messages") or [],
        tools=kwargs.get("tools"),
        model=kwargs.get("model") or "test",
        temperature=kwargs.get("temperature"),
    ):
        out.append(item)
    return out


async def run_concurrent(coros: Sequence[Any]) -> list[Any]:
    """``asyncio.gather`` wrapper for Phase 0.2 session-lock pressure tests."""
    return list(await asyncio.gather(*coros))


async def assert_same_session_serialized(
    *,
    run: Callable[[], Any],
    count: int = 2,
) -> list[Any]:
    """Fire ``count`` overlapping turns; used once AgentLoop lock exists."""
    return await run_concurrent([run() for _ in range(count)])
