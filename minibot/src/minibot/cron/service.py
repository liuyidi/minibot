"""Asyncio cron scheduler for minibot."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from minibot.cron.schedule import compute_next_run, now_ms, validate_schedule
from minibot.cron.store import JobStore
from minibot.cron.types import CronJob, CronJobState, CronPayload, CronRunRecord, CronSchedule, CronStoreFile

logger = logging.getLogger(__name__)

OnJob = Callable[[CronJob], Awaitable[None]]

_MAX_HISTORY = 20
_MAX_SLEEP_S = 60.0


class CronService:
    """Persist jobs and fire due ones via ``on_job`` callback."""

    def __init__(self, store_path: Any, *, on_job: OnJob | None = None) -> None:
        from pathlib import Path

        self.store_path = Path(store_path)
        self._disk = JobStore(self.store_path)
        self._store = CronStoreFile()
        self.on_job = on_job
        self._running = False
        self._timer_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        self._waiters: dict[str, asyncio.Future[None]] = {}
        self.last_error: str | None = None
        self.ticks = 0
        self.fires = 0

    def begin_wait(self, job_id: str) -> asyncio.Future[None]:
        """Register a Future completed by BusWorker when the cron turn finishes."""
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[None] = loop.create_future()
        prev = self._waiters.pop(job_id, None)
        if prev is not None and not prev.done():
            prev.cancel()
        self._waiters[job_id] = fut
        return fut

    def complete_wait(self, job_id: str, *, error: BaseException | None = None) -> None:
        fut = self._waiters.pop(job_id, None)
        if fut is None or fut.done():
            return
        if error is not None:
            fut.set_exception(error)
        else:
            fut.set_result(None)

    @property
    def running(self) -> bool:
        return self._running

    def status(self) -> dict[str, Any]:
        jobs = self._store.jobs
        return {
            "running": self._running,
            "store_path": str(self.store_path),
            "job_count": len(jobs),
            "enabled_count": sum(1 for j in jobs if j.enabled),
            "ticks": self.ticks,
            "fires": self.fires,
            "last_error": self.last_error,
            "next_wake_ms": self._next_wake_ms(),
        }

    async def start(self) -> None:
        if self._running:
            return
        self._store = self._disk.load()
        self._recompute_next_runs()
        self._disk.save(self._store)
        self._running = True
        self._arm_timer()
        logger.info("CronService started (%s jobs) path=%s", len(self._store.jobs), self.store_path)

    async def stop(self) -> None:
        self._running = False
        if self._timer_task is not None:
            self._timer_task.cancel()
            try:
                await self._timer_task
            except asyncio.CancelledError:
                pass
            self._timer_task = None

    def list_jobs(self, *, include_disabled: bool = True) -> list[CronJob]:
        jobs = list(self._store.jobs)
        if not include_disabled:
            jobs = [j for j in jobs if j.enabled]
        return sorted(jobs, key=lambda j: j.state.next_run_at_ms or float("inf"))

    def get_job(self, job_id: str) -> CronJob | None:
        return next((j for j in self._store.jobs if j.id == job_id), None)

    def add_job(
        self,
        *,
        name: str,
        session_id: str,
        schedule: CronSchedule,
        message: str,
        enabled: bool = True,
        delete_after_run: bool = False,
        job_id: str | None = None,
    ) -> CronJob:
        validate_schedule(schedule)
        if not session_id.strip():
            raise ValueError("session_id is required")
        if not message.strip():
            raise ValueError("message is required")
        now = now_ms()
        job = CronJob(
            id=(job_id or uuid.uuid4().hex[:10]),
            name=name.strip() or "job",
            session_id=session_id.strip(),
            enabled=enabled,
            schedule=schedule,
            payload=CronPayload(message=message.strip()),
            state=CronJobState(
                next_run_at_ms=compute_next_run(schedule, now) if enabled else None,
            ),
            created_at_ms=now,
            updated_at_ms=now,
            delete_after_run=delete_after_run or schedule.kind == "at",
        )
        self._store.jobs.append(job)
        self._persist_and_rearm()
        return job

    def remove_job(self, job_id: str) -> bool:
        before = len(self._store.jobs)
        self._store.jobs = [j for j in self._store.jobs if j.id != job_id]
        if len(self._store.jobs) == before:
            return False
        self._persist_and_rearm()
        return True

    def enable_job(self, job_id: str, enabled: bool = True) -> CronJob | None:
        job = self.get_job(job_id)
        if job is None:
            return None
        job.enabled = enabled
        job.updated_at_ms = now_ms()
        if enabled:
            job.state.next_run_at_ms = compute_next_run(job.schedule, now_ms())
        else:
            job.state.next_run_at_ms = None
        self._persist_and_rearm()
        return job

    async def run_job_now(self, job_id: str) -> CronJob | None:
        job = self.get_job(job_id)
        if job is None:
            return None
        async with self._lock:
            await self._execute_job(job)
            self._disk.save(self._store)
        self._arm_timer()
        return job

    def job_public(self, job: CronJob) -> dict[str, Any]:
        d = job.to_dict()
        d["store_path"] = str(self.store_path)
        return d

    def _persist_and_rearm(self) -> None:
        self._disk.save(self._store)
        if self._running:
            self._arm_timer()

    def _recompute_next_runs(self) -> None:
        now = now_ms()
        for job in self._store.jobs:
            if job.enabled:
                job.state.next_run_at_ms = compute_next_run(job.schedule, now)
            else:
                job.state.next_run_at_ms = None

    def _next_wake_ms(self) -> int | None:
        times = [j.state.next_run_at_ms for j in self._store.jobs if j.enabled and j.state.next_run_at_ms]
        return min(times) if times else None

    def _arm_timer(self) -> None:
        if self._timer_task is not None:
            self._timer_task.cancel()
            self._timer_task = None
        if not self._running:
            return
        wake = self._next_wake_ms()
        if wake is None:
            delay = _MAX_SLEEP_S
        else:
            delay = min(_MAX_SLEEP_S, max(0.0, (wake - now_ms()) / 1000.0))

        async def tick() -> None:
            await asyncio.sleep(delay)
            if self._running:
                await self._on_timer()

        self._timer_task = asyncio.create_task(tick(), name="minibot-cron-tick")

    async def _on_timer(self) -> None:
        self.ticks += 1
        async with self._lock:
            now = now_ms()
            due = [
                j
                for j in self._store.jobs
                if j.enabled and j.state.next_run_at_ms is not None and now >= j.state.next_run_at_ms
            ]
            for job in due:
                await self._execute_job(job)
            self._disk.save(self._store)
        self._arm_timer()

    async def _execute_job(self, job: CronJob) -> None:
        start = now_ms()
        logger.info("Cron fire job=%s name=%s session=%s", job.id, job.name, job.session_id)
        self.fires += 1
        try:
            if self.on_job is None:
                raise RuntimeError("cron on_job callback not configured")
            await self.on_job(job)
            job.state.last_status = "ok"
            job.state.last_error = None
        except Exception as exc:
            job.state.last_status = "error"
            job.state.last_error = f"{type(exc).__name__}: {exc}"
            self.last_error = job.state.last_error
            logger.exception("Cron job failed id=%s", job.id)

        end = now_ms()
        job.state.last_run_at_ms = start
        job.updated_at_ms = end
        job.state.run_history.append(
            CronRunRecord(
                run_at_ms=start,
                status=job.state.last_status or "error",
                duration_ms=end - start,
                error=job.state.last_error,
            )
        )
        job.state.run_history = job.state.run_history[-_MAX_HISTORY:]

        if job.schedule.kind == "at":
            if job.delete_after_run:
                self._store.jobs = [j for j in self._store.jobs if j.id != job.id]
            else:
                job.enabled = False
                job.state.next_run_at_ms = None
        elif job.enabled:
            job.state.next_run_at_ms = compute_next_run(job.schedule, now_ms())
        else:
            job.state.next_run_at_ms = None
