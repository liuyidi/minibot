"""Phase C adapter helpers (prompt + score no-ops)."""

from __future__ import annotations

import pytest

from minibot.config.settings import Settings
from minibot.observability import langfuse as lf


@pytest.fixture(autouse=True)
def _reset() -> None:
    lf.shutdown()
    yield
    lf.shutdown()


def test_ensure_system_prompt_noop_when_disabled() -> None:
    lf.init_from_settings(Settings(langfuse_enabled=False))
    assert lf.ensure_system_prompt("You are minibot") is None


def test_score_noop_when_disabled() -> None:
    lf.init_from_settings(Settings(langfuse_enabled=False))
    assert lf.score(trace_id="trace_x", value=1.0) is None


def test_observation_accepts_prompt_version_id() -> None:
    lf.init_from_settings(Settings(langfuse_enabled=False))
    with lf.observation(
        as_type="generation",
        name="llm",
        model="m",
        prompt_version_id="pv_fake",
    ) as span:
        span.update(output="ok")


def test_observability_public_payload() -> None:
    s = Settings(langfuse_enabled=True, langfuse_host="http://localhost:8000/")
    payload = lf.observability_public_payload(s)
    assert payload["langfuse_host"] == "http://localhost:8000"
    assert "langfuse_enabled" in payload
    assert "langfuse_configured" in payload
