"""Schedule next-run helpers."""

from __future__ import annotations

from datetime import datetime

from minibot.cron.types import CronSchedule


def now_ms() -> int:
    return int(datetime.now().timestamp() * 1000)


def compute_next_run(schedule: CronSchedule, now: int | None = None) -> int | None:
    """Return next fire time in epoch ms, or None if not schedulable."""
    ref = now if now is not None else now_ms()

    if schedule.kind == "at":
        if schedule.at_ms is None:
            return None
        return schedule.at_ms if schedule.at_ms > ref else None

    if schedule.kind == "every":
        if not schedule.every_ms or schedule.every_ms <= 0:
            return None
        return ref + schedule.every_ms

    if schedule.kind == "cron" and schedule.expr:
        try:
            from zoneinfo import ZoneInfo

            from croniter import croniter

            tz = ZoneInfo(schedule.tz) if schedule.tz else datetime.now().astimezone().tzinfo
            base_dt = datetime.fromtimestamp(ref / 1000, tz=tz)
            nxt = croniter(schedule.expr, base_dt).get_next(datetime)
            return int(nxt.timestamp() * 1000)
        except Exception:
            return None

    return None


def validate_schedule(schedule: CronSchedule) -> None:
    """Raise ValueError if schedule cannot run."""
    if schedule.tz and schedule.kind != "cron":
        raise ValueError("tz can only be used with cron schedules")

    if schedule.kind == "at":
        if not schedule.at_ms or schedule.at_ms <= 0:
            raise ValueError("at schedule requires at_ms > 0")
        return

    if schedule.kind == "every":
        if not schedule.every_ms or schedule.every_ms <= 0:
            raise ValueError("every schedule requires every_ms > 0")
        if schedule.every_ms < 1_000:
            raise ValueError("every_ms must be >= 1000")
        return

    if schedule.kind == "cron":
        if not (schedule.expr or "").strip():
            raise ValueError("cron schedule requires expr")
        if schedule.tz:
            try:
                from zoneinfo import ZoneInfo

                ZoneInfo(schedule.tz)
            except Exception as exc:
                raise ValueError(f"unknown timezone '{schedule.tz}'") from exc
        try:
            from croniter import croniter

            croniter(schedule.expr)
        except Exception as exc:
            raise ValueError(f"invalid cron expression '{schedule.expr}'") from exc
        if compute_next_run(schedule, now_ms()) is None:
            raise ValueError(f"cannot compute next run for '{schedule.expr}'")
        return

    raise ValueError(f"unknown schedule kind '{schedule.kind}'")
