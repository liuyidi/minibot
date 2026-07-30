"""Shared pytest fixtures for minibot tests."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from fake_provider import FakeProvider, StreamDelta, streaming_text, text_response
from helpers import assert_same_session_serialized, assert_ws_events, collect_stream, run_concurrent
from minibot.config.settings import get_settings
from minibot.main import create_app


@pytest.fixture()
def data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Isolated ``MINIBOT_SERVER_DATA_DIR`` per test; clears settings cache."""
    monkeypatch.setenv("MINIBOT_SERVER_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


@pytest.fixture()
def fake_provider() -> FakeProvider:
    """Default: one final text reply so REST turns never hit the network."""
    return FakeProvider(
        responses=[
            text_response(
                "ok from fake provider",
                usage={"prompt_tokens": 12, "completion_tokens": 4, "total_tokens": 16},
            )
        ]
    )


@pytest.fixture()
def fake_trace() -> list[dict[str, Any]]:
    """Minimal runner-shaped trace for exporter / UI unit tests."""
    return [
        {
            "type": "prepare",
            "t_start": 1_700_000_000_000,
            "t_end": 1_700_000_000_001,
            "duration_ms": 1.0,
            "model": "test-model",
            "message_count": 2,
            "tool_names": ["echo"],
            "system_injected": True,
            "messages": [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}],
        },
        {
            "type": "llm_request",
            "t_start": 1_700_000_000_010,
            "t_end": 1_700_000_000_010,
            "duration_ms": 0.0,
            "iteration": 1,
            "model": "test-model",
            "message_count": 2,
            "ts": "2026-01-01T00:00:00+00:00",
            "tools_offered": ["echo"],
            "messages": [{"role": "user", "content": "hi"}],
        },
        {
            "type": "llm_final",
            "t_start": 1_700_000_000_010,
            "t_end": 1_700_000_001_010,
            "iteration": 1,
            "finish_reason": "stop",
            "content": "hello",
            "ts": "2026-01-01T00:00:01+00:00",
            "request_ts": "2026-01-01T00:00:00+00:00",
            "duration_ms": 1000.0,
            "usage": {"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 13},
        },
        {
            "type": "done",
            "t_start": 1_700_000_001_011,
            "t_end": 1_700_000_001_012,
            "duration_ms": 1.0,
            "stop_reason": "completed",
            "iterations_used": 1,
            "tools_used": [],
            "content": "hello",
        },
    ]


@pytest.fixture()
def fake_streaming_response() -> list[StreamDelta]:
    return streaming_text(["Hel", "lo", "!"])


@pytest.fixture()
def app(data_dir: Path, fake_provider: FakeProvider, monkeypatch: pytest.MonkeyPatch):
    """FastAPI app with FakeProvider injected (no real OpenAI calls)."""

    def _factory(**_kwargs: Any) -> FakeProvider:
        return fake_provider

    monkeypatch.setattr("minibot.providers.factory.build_provider", _factory)
    return create_app()


@pytest.fixture()
def client(app) -> Iterable[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers(client: TestClient) -> dict[str, str]:
    boot = client.get("/auth/bootstrap")
    assert boot.status_code == 200
    token = boot.json()["token"]
    return {"Authorization": f"Bearer {token}"}


# Re-exports so ``from conftest import assert_ws_events`` still works in notebooks.
__all__ = [
    "FakeProvider",
    "StreamDelta",
    "assert_same_session_serialized",
    "assert_ws_events",
    "collect_stream",
    "run_concurrent",
    "text_response",
]
