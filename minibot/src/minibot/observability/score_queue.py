"""Best-effort asynchronous delivery for human feedback scores."""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScoreJob:
    id: str
    trace_id: str
    name: str
    value: float | None
    string_value: str | None
    data_type: str
    comment: str | None
    source: str


class ScoreQueue:
    """Single-consumer queue that keeps score writes off the request path."""

    def __init__(self, *, max_attempts: int = 3) -> None:
        self._queue: asyncio.Queue[ScoreJob] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None
        self._max_attempts = max_attempts

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="minibot-score-queue")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    def enqueue(
        self,
        *,
        trace_id: str,
        name: str,
        value: float | None,
        string_value: str | None,
        data_type: str,
        comment: str | None,
        source: str = "HUMAN",
    ) -> str:
        job = ScoreJob(
            id=f"score_{uuid.uuid4().hex}",
            trace_id=trace_id,
            name=name,
            value=value,
            string_value=string_value,
            data_type=data_type,
            comment=comment,
            source=source,
        )
        self._queue.put_nowait(job)
        return job.id

    async def _run(self) -> None:
        from minibot.observability import langfuse as lf

        while True:
            job = await self._queue.get()
            try:
                for attempt in range(1, self._max_attempts + 1):
                    result = await asyncio.to_thread(
                        lf.score,
                        trace_id=job.trace_id,
                        name=job.name,
                        value=job.value,
                        string_value=job.string_value,
                        data_type=job.data_type,
                        comment=job.comment,
                        source=job.source,
                    )
                    if result is not None:
                        break
                    if attempt < self._max_attempts:
                        await asyncio.sleep(0.4 * (2 ** (attempt - 1)))
                else:
                    log.warning("langfuse score %s failed after %s attempts", job.id, self._max_attempts)
            finally:
                self._queue.task_done()
