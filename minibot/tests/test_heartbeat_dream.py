"""Heartbeat / Dream system job helpers and registration."""

from __future__ import annotations

import asyncio
from pathlib import Path

from minibot.agent.heartbeat import heartbeat_has_active_tasks, pick_heartbeat_target
from minibot.config.app_config import AppConfig, DreamConfig, HeartbeatConfig
from minibot.cron.service import CronService
from minibot.cron.system_jobs import ensure_system_cron_jobs
from minibot.cron.types import is_system_job
from minibot.session.store import SessionStore
from minibot.workspace import seed_workspace_bootstrap


def test_heartbeat_has_active_tasks_parses_section() -> None:
    empty = "# Heartbeat\n\n## Active Tasks\n\n<!-- comment -->\n"
    assert heartbeat_has_active_tasks(empty) is False
    with_task = "# Heartbeat\n\n## Active Tasks\n\n- Check inbox\n"
    assert heartbeat_has_active_tasks(with_task) is True
    outside = "## Other\n\n- not counted\n\n## Active Tasks\n\n"
    assert heartbeat_has_active_tasks(outside) is False


def test_seed_heartbeat_template(tmp_path: Path) -> None:
    written = seed_workspace_bootstrap(tmp_path)
    assert "HEARTBEAT.md" in written
    assert (tmp_path / "HEARTBEAT.md").is_file()
    # never overwrite
    (tmp_path / "HEARTBEAT.md").write_text("custom\n", encoding="utf-8")
    again = seed_workspace_bootstrap(tmp_path)
    assert "HEARTBEAT.md" not in again
    assert (tmp_path / "HEARTBEAT.md").read_text(encoding="utf-8") == "custom\n"


def test_pick_heartbeat_target_prefers_recent(tmp_path: Path) -> None:
    store = SessionStore(tmp_path)
    store.create(session_id="old", title="old")
    store.create(session_id="new", title="new")
    store.create(session_id="heartbeat", title="hb")
    target = pick_heartbeat_target(store)
    assert target == ("websocket", "new")


def test_ensure_system_cron_jobs_defaults(tmp_path: Path) -> None:
    path = tmp_path / "jobs.json"

    async def on_job(job) -> None:  # noqa: ANN001
        return None

    svc = CronService(path, on_job=on_job)
    config = AppConfig(
        heartbeat=HeartbeatConfig(enabled=True, interval_s=3600),
        dream=DreamConfig(enabled=False, interval_h=48),
    )

    async def _run() -> None:
        await svc.start()
        ensure_system_cron_jobs(svc, config)
        hb = svc.get_job("heartbeat")
        dream = svc.get_job("dream")
        assert hb is not None and is_system_job(hb) and hb.enabled is True
        assert hb.schedule.kind == "every" and hb.schedule.every_ms == 3_600_000
        assert dream is not None and is_system_job(dream) and dream.enabled is False
        assert dream.schedule.every_ms == 48 * 3_600_000
        assert svc.remove_job("heartbeat") == "protected"
        assert svc.update_job("heartbeat", name="x") == "protected"
        # refresh keeps single row
        ensure_system_cron_jobs(svc, config)
        ids = [j.id for j in svc.list_jobs()]
        assert ids.count("heartbeat") == 1
        assert ids.count("dream") == 1
        await svc.stop()

    asyncio.run(_run())


def test_system_jobs_visible_in_api(client, auth_headers: dict[str, str]) -> None:
    listed = client.get("/api/webui/automations", headers=auth_headers)
    assert listed.status_code == 200
    jobs = listed.json()["jobs"]
    by_id = {j["id"]: j for j in jobs}
    assert "heartbeat" in by_id
    assert by_id["heartbeat"]["protected"] is True
    assert by_id["heartbeat"]["enabled"] is True
    assert "dream" in by_id
    assert by_id["dream"]["protected"] is True
    assert by_id["dream"]["enabled"] is False

    denied = client.delete("/api/webui/automations/heartbeat", headers=auth_headers)
    assert denied.status_code == 403
