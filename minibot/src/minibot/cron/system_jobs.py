"""Register / refresh Heartbeat and Dream system cron jobs from AppConfig."""

from __future__ import annotations

import logging

from minibot.config.app_config import AppConfig
from minibot.cron.service import CronService
from minibot.cron.types import CronJob, CronJobState, CronPayload, CronSchedule

logger = logging.getLogger(__name__)

HEARTBEAT_JOB_ID = "heartbeat"
DREAM_JOB_ID = "dream"


def ensure_system_cron_jobs(cron: CronService, config: AppConfig) -> None:
    """Idempotently sync system jobs with config (call after CronService.start)."""
    hb = config.heartbeat
    interval_ms = max(60_000, int(hb.interval_s or 3600) * 1000)
    cron.register_system_job(
        CronJob(
            id=HEARTBEAT_JOB_ID,
            name="heartbeat",
            session_id="",
            enabled=bool(hb.enabled),
            schedule=CronSchedule(kind="every", every_ms=interval_ms, tz=config.timezone or "UTC"),
            payload=CronPayload(kind="system_event", message=""),
            state=CronJobState(),
        )
    )

    dream = config.dream
    every_ms = max(3_600_000, int(dream.interval_h or 48) * 3_600_000)
    cron.register_system_job(
        CronJob(
            id=DREAM_JOB_ID,
            name="dream",
            session_id="",
            enabled=bool(dream.enabled),
            schedule=CronSchedule(kind="every", every_ms=every_ms, tz=config.timezone or "UTC"),
            payload=CronPayload(kind="system_event", message=""),
            state=CronJobState(),
        )
    )
    logger.info(
        "System cron synced: heartbeat=%s/%ss dream=%s/%sh",
        hb.enabled,
        hb.interval_s,
        dream.enabled,
        dream.interval_h,
    )
