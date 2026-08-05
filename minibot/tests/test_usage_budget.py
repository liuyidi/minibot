"""Daily LLM usage budget / kill-switch."""

from __future__ import annotations

from pathlib import Path

import pytest

from minibot.observability.usage_budget import BudgetExceeded, UsageBudget, sum_usage_from_trace


def test_sum_usage_from_trace() -> None:
    trace = [
        {"type": "llm_final", "usage": {"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 13}},
        {"type": "llm_final", "usage": {"prompt_tokens": 5, "completion_tokens": 2}},
        {"type": "done"},
    ]
    assert sum_usage_from_trace(trace) == {
        "prompt_tokens": 15,
        "completion_tokens": 5,
        "total_tokens": 20,
    }


def test_unlimited_when_limits_zero(tmp_path: Path) -> None:
    budget = UsageBudget(tmp_path, daily_token_limit=0, daily_turn_limit=0)
    budget.check(entry="ws")
    budget.record_turn(entry="ws", usage={"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150})
    snap = budget.snapshot()
    assert snap["tripped"] is False
    assert snap["totals"]["turns"] == 1
    assert snap["totals"]["total_tokens"] == 150


def test_turn_limit_blocks_second_turn(tmp_path: Path) -> None:
    budget = UsageBudget(tmp_path, daily_token_limit=0, daily_turn_limit=1)
    budget.check(entry="rest")
    budget.record_turn(entry="rest", usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2})
    with pytest.raises(BudgetExceeded) as ei:
        budget.check(entry="rest")
    assert ei.value.reason == "daily_turn_limit"
    assert budget.snapshot()["tripped"] is True


def test_token_limit_trips_after_record(tmp_path: Path) -> None:
    budget = UsageBudget(tmp_path, daily_token_limit=100, daily_turn_limit=0)
    budget.check(entry="cron")
    budget.record_turn(
        entry="cron",
        usage={"prompt_tokens": 80, "completion_tokens": 30, "total_tokens": 110},
    )
    assert budget.snapshot()["tripped"] is True
    with pytest.raises(BudgetExceeded) as ei:
        budget.check(entry="ws")
    assert ei.value.reason == "daily_token_limit"


def test_persists_across_instances(tmp_path: Path) -> None:
    a = UsageBudget(tmp_path, daily_token_limit=0, daily_turn_limit=5)
    a.record_turn(entry="ws", usage={"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12})
    b = UsageBudget(tmp_path, daily_token_limit=0, daily_turn_limit=5)
    assert b.snapshot()["totals"]["turns"] == 1
    assert b.snapshot()["by_entry"]["ws"]["turns"] == 1


def test_by_entry_attribution(tmp_path: Path) -> None:
    budget = UsageBudget(tmp_path, daily_token_limit=0, daily_turn_limit=0)
    budget.record_turn(entry="ws", usage={"prompt_tokens": 10, "completion_tokens": 1, "total_tokens": 11})
    budget.record_turn(entry="cron", usage={"prompt_tokens": 20, "completion_tokens": 5, "total_tokens": 25})
    by = budget.snapshot()["by_entry"]
    assert by["ws"]["total_tokens"] == 11
    assert by["cron"]["total_tokens"] == 25


def test_api_blocks_turn_when_budget_tripped(client, auth_headers: dict[str, str]) -> None:
    state = client.app.state.app_state
    assert state.usage_budget is not None
    state.usage_budget.daily_turn_limit = 1
    state.usage_budget.daily_token_limit = 0

    created = client.post("/api/sessions", headers=auth_headers, json={})
    assert created.status_code == 200
    sid = created.json()["id"]

    ok = client.post(f"/api/sessions/{sid}/turns", headers=auth_headers, json={"content": "hi"})
    assert ok.status_code == 200, ok.text

    blocked = client.post(f"/api/sessions/{sid}/turns", headers=auth_headers, json={"content": "again"})
    assert blocked.status_code == 429, blocked.text
    body = blocked.json()
    assert "budget" in str(body).lower() or "limit" in str(body).lower() or "detail" in body

    usage = client.get("/api/settings/usage", headers=auth_headers)
    assert usage.status_code == 200
    payload = usage.json()
    assert payload["totals"]["turns"] >= 1
    assert payload["tripped"] is True
