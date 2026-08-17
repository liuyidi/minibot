"""Tests for desktop platform-proxy budget isolation."""

from __future__ import annotations

from pathlib import Path

import pytest

from minibot.platform_proxy.budget import BudgetExceeded, DesktopBudget


def test_unlimited_allows_turns(tmp_path: Path) -> None:
    budget = DesktopBudget(tmp_path, daily_token_limit=0, daily_turn_limit=0)
    budget.check("u1")
    budget.record("u1", prompt_tokens=10, completion_tokens=5)
    snap = budget.snapshot("u1")
    assert snap["totals"]["turns"] == 1
    assert snap["totals"]["total_tokens"] == 15


def test_turn_limit_trips(tmp_path: Path) -> None:
    budget = DesktopBudget(tmp_path, daily_token_limit=0, daily_turn_limit=1)
    budget.check("u1")
    budget.record("u1", prompt_tokens=1, completion_tokens=1)
    with pytest.raises(BudgetExceeded):
        budget.check("u1")


def test_users_isolated(tmp_path: Path) -> None:
    budget = DesktopBudget(tmp_path, daily_token_limit=0, daily_turn_limit=1)
    budget.record("u1", prompt_tokens=1, completion_tokens=0)
    budget.check("u2")  # other user still ok
    with pytest.raises(BudgetExceeded):
        budget.check("u1")
