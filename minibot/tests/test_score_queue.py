from __future__ import annotations

import asyncio

import pytest

from minibot.observability.score_queue import ScoreQueue


@pytest.mark.asyncio
async def test_score_queue_retries_failed_delivery(monkeypatch: pytest.MonkeyPatch) -> None:
    from minibot.observability import langfuse as lf

    attempts = 0

    def fake_score(**_kwargs: object) -> dict[str, str] | None:
        nonlocal attempts
        attempts += 1
        return None if attempts == 1 else {"id": "score_ok"}

    monkeypatch.setattr(lf, "score", fake_score)
    queue = ScoreQueue(max_attempts=3)
    queue.start()
    try:
        job_id = queue.enqueue(
            trace_id="trace_1",
            name="user-feedback",
            value=1,
            string_value="true",
            data_type="BOOLEAN",
            comment=None,
        )
        assert job_id.startswith("score_")
        await asyncio.wait_for(queue._queue.join(), timeout=2)
        assert attempts == 2
    finally:
        await queue.stop()
