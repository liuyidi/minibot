"""Per-user daily budget for desktop platform proxy traffic."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from minibot.observability.usage_budget import BudgetExceeded, UsageBudget


class DesktopBudget:
    """Isolate desktop proxy usage from Web/in-process ``UsageBudget`` trees."""

    def __init__(
        self,
        data_dir: Path,
        *,
        daily_token_limit: int = 0,
        daily_turn_limit: int = 0,
    ) -> None:
        self.data_dir = Path(data_dir).expanduser()
        self.daily_token_limit = max(0, int(daily_token_limit))
        self.daily_turn_limit = max(0, int(daily_turn_limit))
        self._budgets: dict[str, UsageBudget] = {}

    def _budget_for(self, user_id: str) -> UsageBudget:
        uid = (user_id or "").strip() or "anonymous"
        existing = self._budgets.get(uid)
        if existing is not None:
            return existing
        root = self.data_dir / "usage" / "desktop" / uid
        budget = UsageBudget(
            root,
            daily_token_limit=self.daily_token_limit,
            daily_turn_limit=self.daily_turn_limit,
        )
        self._budgets[uid] = budget
        return budget

    def check(self, user_id: str) -> None:
        self._budget_for(user_id).check(entry="platform_proxy")

    def record(
        self,
        user_id: str,
        *,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
    ) -> None:
        prompt = max(0, int(prompt_tokens))
        completion = max(0, int(completion_tokens))
        self._budget_for(user_id).record_turn(
            entry="platform_proxy",
            usage={
                "prompt_tokens": prompt,
                "completion_tokens": completion,
                "total_tokens": prompt + completion,
            },
        )

    def snapshot(self, user_id: str) -> dict[str, Any]:
        return self._budget_for(user_id).snapshot()


__all__ = ["BudgetExceeded", "DesktopBudget"]
