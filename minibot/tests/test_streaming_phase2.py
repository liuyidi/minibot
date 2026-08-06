"""Phase 2 streaming tests."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fake_provider import FakeProvider, streaming_text, text_response
from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.stream_coalesce import StreamCoalescer
from minibot.agent.tools.builtin import register_default_tools
from minibot.bus.events import OutboundMessage
from minibot.bus.queue import MessageBus
from minibot.config.app_config import AppConfig
from minibot.providers.base import StreamEnd, TextDelta, aggregate_stream
from minibot.providers.openai_compat import parse_sse_data_payload
from minibot.session.store import SessionStore
from minibot.api.ws import _session_id
from minibot.api import ws as ws_mod


def test_session_id_strips_websocket_prefix() -> None:
    assert _session_id("websocket:abc123") == "abc123"
    assert _session_id("abc123") == "abc123"
    assert _session_id("  websocket:x  ") == "x"


def test_parse_sse_payload() -> None:
    chunk = parse_sse_data_payload(json.dumps({"choices": [{"delta": {"content": "Hi"}}]}))
    assert chunk is not None
    assert chunk["choices"][0]["delta"]["content"] == "Hi"


async def _collect_text(provider: FakeProvider) -> list[str]:
    parts: list[str] = []
    async for ev in provider.chat_stream([], model="m"):
        if isinstance(ev, TextDelta):
            parts.append(ev.text)
    return parts


def test_fake_provider_chat_stream_chunks() -> None:
    provider = FakeProvider(streams=[streaming_text(["Hel", "lo"])])
    parts = asyncio.run(_collect_text(provider))
    assert parts == ["Hel", "lo"]


def test_aggregate_stream_text() -> None:
    async def gen():
        yield TextDelta(text="a")
        yield TextDelta(text="b")
        yield StreamEnd(finish_reason="stop", content="ab")

    resp = asyncio.run(aggregate_stream(gen()))
    assert resp.content == "ab"


def test_coalescer_flushes_on_size() -> None:
    c = StreamCoalescer(min_chars=4, max_interval_s=10.0)
    assert c.push_text("ab") == []
    assert c.push_text("cd") == ["abcd"]


def test_runner_run_stream_text() -> None:
    provider = FakeProvider(streams=[streaming_text(["Hi", "!"])])
    runner = AgentRunner(provider)
    tools = register_default_tools()
    events: list[str] = []

    async def _run() -> None:
        async for ev in runner.run_stream(
            messages=[{"role": "user", "content": "hi"}],
            tools=tools,
            model="test",
        ):
            events.append(ev.kind)

    asyncio.run(_run())
    assert "delta" in events
    assert "stream_end" in events
    assert "done" in events


def test_loop_stream_publishes_deltas(tmp_path: Path) -> None:
    bus = MessageBus()
    provider = FakeProvider(streams=[streaming_text(["x", "y"])])
    sessions = SessionStore(data_dir=tmp_path)
    session = sessions.create(title="s")
    loop = AgentLoop(
        sessions=sessions,
        tools=register_default_tools(),
        runner=AgentRunner(provider),
        config=AppConfig(),
    )

    async def _run() -> list[str]:
        await loop.handle_turn(session.id, "hi", entry="ws", bus=bus)
        kinds: list[str] = []
        while not bus.outbound.empty():
            msg = bus.outbound.get_nowait()
            kinds.append(str((msg.metadata or {}).get("kind")))
        return kinds

    kinds = asyncio.run(_run())
    assert "delta" in kinds
    assert "turn_ok" in kinds
    assert "turn_end" in kinds


def test_deliver_outbound_delta_event() -> None:
    async def _run() -> list[dict]:
        sent: list[dict] = []

        async def fake_send(chat_id: str, payload: dict) -> None:
            sent.append(payload)

        ws_mod.hub.send = fake_send  # type: ignore[method-assign]
        await ws_mod.deliver_outbound(
            OutboundMessage(
                channel="websocket",
                chat_id="c1",
                content="Hel",
                metadata={"kind": "delta", "stream_id": "s1"},
            )
        )
        return sent

    frames = asyncio.run(_run())
    assert frames[0]["event"] == "delta"
    assert frames[0]["text"] == "Hel"


def test_deliver_outbound_tool_result_is_hint_not_assistant_message() -> None:
    """tool_result must not dump raw output as a chat message / end the turn."""

    async def _run() -> list[dict]:
        sent: list[dict] = []

        async def fake_send(chat_id: str, payload: dict) -> None:
            sent.append(payload)

        ws_mod.hub.send = fake_send  # type: ignore[method-assign]
        await ws_mod.deliver_outbound(
            OutboundMessage(
                channel="websocket",
                chat_id="c1",
                content="No results (or DDG blocked the scrape).",
                metadata={"kind": "tool_result", "name": "web_search"},
            )
        )
        return sent

    frames = asyncio.run(_run())
    assert len(frames) == 1
    assert frames[0]["event"] == "message"
    assert frames[0]["kind"] == "tool_hint"
    assert frames[0]["text"] == "tool done: web_search"
    assert "No results" not in frames[0]["text"]
    assert "turn_end" not in {f["event"] for f in frames}


def test_deliver_outbound_turn_ok_skips_message_when_streamed() -> None:
    """Streamed turns must not re-send full assistant text (WebUI duplicate bubble)."""

    async def _run() -> list[dict]:
        sent: list[dict] = []

        async def fake_send(chat_id: str, payload: dict) -> None:
            sent.append(payload)

        ws_mod.hub.send = fake_send  # type: ignore[method-assign]
        await ws_mod.deliver_outbound(
            OutboundMessage(
                channel="websocket",
                chat_id="c1",
                content="Hello world",
                metadata={
                    "kind": "turn_ok",
                    "_streamed": True,
                    "tools_used": [],
                    "trace": [],
                    "stop_reason": "stop",
                },
            )
        )
        return sent

    frames = asyncio.run(_run())
    events = [f["event"] for f in frames]
    assert "message" not in events
    assert "agent_trace" in events


def test_deliver_outbound_turn_ok_sends_message_when_not_streamed() -> None:
    async def _run() -> list[dict]:
        sent: list[dict] = []

        async def fake_send(chat_id: str, payload: dict) -> None:
            sent.append(payload)

        ws_mod.hub.send = fake_send  # type: ignore[method-assign]
        await ws_mod.deliver_outbound(
            OutboundMessage(
                channel="websocket",
                chat_id="c1",
                content="Hello world",
                metadata={
                    "kind": "turn_ok",
                    "tools_used": [],
                    "trace": [],
                    "stop_reason": "stop",
                },
            )
        )
        return sent

    frames = asyncio.run(_run())
    messages = [f for f in frames if f["event"] == "message"]
    assert len(messages) == 1
    assert messages[0]["text"] == "Hello world"


def test_loop_abort(tmp_path: Path) -> None:
    provider = FakeProvider(
        streams=[streaming_text(["slow", "text"])],
    )
    provider.stream_delay_s = 0.05
    sessions = SessionStore(data_dir=tmp_path)
    session = sessions.create(title="s")
    loop = AgentLoop(
        sessions=sessions,
        tools=register_default_tools(),
        runner=AgentRunner(provider),
        config=AppConfig(),
    )
    bus = MessageBus()

    async def _run() -> str:
        task = asyncio.create_task(
            loop.handle_turn(session.id, "hi", entry="ws", bus=bus),
        )
        await asyncio.sleep(0.01)
        loop.request_abort(session.id)
        result = await task
        return result.stop_reason

    stop = asyncio.run(_run())
    assert stop == "aborted"


def test_runner_non_stream_still_works() -> None:
    provider = FakeProvider(responses=[text_response("ok")])
    runner = AgentRunner(provider)
    tools = register_default_tools()

    async def _run():
        return await runner.run(
            messages=[{"role": "user", "content": "hi"}],
            tools=tools,
            model="test",
        )

    result = asyncio.run(_run())
    assert result.content == "ok"
