"""Phase 4 cron / automations tests."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi.testclient import TestClient

from minibot.cron.schedule import compute_next_run, now_ms, validate_schedule
from minibot.cron.service import CronService
from minibot.cron.types import CronSchedule


def test_compute_next_every_and_at() -> None:
    now = 1_000_000
    nxt = compute_next_run(CronSchedule(kind="every", every_ms=5_000), now)
    assert nxt == now + 5_000
    assert compute_next_run(CronSchedule(kind="at", at_ms=now + 10), now) == now + 10
    assert compute_next_run(CronSchedule(kind="at", at_ms=now - 1), now) is None


def test_validate_bad_cron() -> None:
    try:
        validate_schedule(CronSchedule(kind="cron", expr="not-a-cron"))
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_validate_cron_ok() -> None:
    validate_schedule(CronSchedule(kind="cron", expr="0 9 * * *"))
    nxt = compute_next_run(CronSchedule(kind="cron", expr="0 9 * * *"), now_ms())
    assert nxt is not None and nxt > now_ms()


def test_job_store_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "jobs.json"
    fired: list[str] = []

    async def on_job(job) -> None:
        fired.append(job.id)

    svc = CronService(path, on_job=on_job)

    async def _run() -> None:
        await svc.start()
        job = svc.add_job(
            name="t",
            session_id="sess-1",
            schedule=CronSchedule(kind="every", every_ms=60_000),
            message="hi",
            enabled=False,
        )
        assert job.id
        assert path.exists()
        raw = json.loads(path.read_text(encoding="utf-8"))
        assert raw["jobs"][0]["payload"]["message"] == "hi"
        assert svc.enable_job(job.id, True) is not None
        assert svc.get_job(job.id).enabled is True
        assert svc.remove_job(job.id) is True
        await svc.stop()

    asyncio.run(_run())


def test_run_job_now_records_status(tmp_path: Path) -> None:
    path = tmp_path / "jobs.json"

    async def on_job(job) -> None:
        return None

    svc = CronService(path, on_job=on_job)

    async def _run() -> None:
        await svc.start()
        job = svc.add_job(
            name="now",
            session_id="s1",
            schedule=CronSchedule(kind="every", every_ms=60_000),
            message="ping",
            enabled=False,
        )
        out = await svc.run_job_now(job.id)
        assert out is not None
        assert out.state.last_status == "ok"
        assert out.state.last_run_at_ms is not None
        await svc.stop()

    asyncio.run(_run())


def test_automations_api_crud(client: TestClient, auth_headers: dict[str, str]) -> None:
    sess = client.post("/api/sessions", headers=auth_headers, json={"title": "cron-test"})
    assert sess.status_code == 200
    sid = sess.json()["id"]

    bad = client.post(
        "/api/webui/automations",
        headers=auth_headers,
        json={
            "name": "bad",
            "session_id": sid,
            "schedule": {"kind": "cron", "expr": "bad expr"},
            "message": "x",
        },
    )
    assert bad.status_code == 400

    missing = client.post(
        "/api/webui/automations",
        headers=auth_headers,
        json={
            "name": "x",
            "session_id": "nope",
            "schedule": {"kind": "every", "every_ms": 15000},
            "message": "x",
        },
    )
    assert missing.status_code == 404

    created = client.post(
        "/api/webui/automations",
        headers=auth_headers,
        json={
            "name": "ping",
            "session_id": sid,
            "schedule": {"kind": "every", "every_ms": 60000},
            "message": "hello from cron test",
            "enabled": False,
        },
    )
    assert created.status_code == 200, created.text
    job_id = created.json()["job"]["id"]

    listed = client.get("/api/webui/automations", headers=auth_headers).json()
    assert any(j["id"] == job_id for j in listed["jobs"])

    en = client.post(f"/api/webui/automations/{job_id}/enable", headers=auth_headers)
    assert en.status_code == 200
    assert en.json()["job"]["enabled"] is True

    dis = client.post(f"/api/webui/automations/{job_id}/disable", headers=auth_headers)
    assert dis.status_code == 200
    assert dis.json()["job"]["enabled"] is False

    deleted = client.delete(f"/api/webui/automations/{job_id}", headers=auth_headers)
    assert deleted.status_code == 200

    snap = client.get("/api/dev/cron", headers=auth_headers).json()
    assert snap["ok"] is True
    assert "store_path" in snap


def test_automations_run_now_via_bus(client: TestClient, auth_headers: dict[str, str]) -> None:
    sess = client.post("/api/sessions", headers=auth_headers, json={"title": "cron-run"})
    sid = sess.json()["id"]
    created = client.post(
        "/api/webui/automations",
        headers=auth_headers,
        json={
            "name": "runme",
            "session_id": sid,
            "schedule": {"kind": "every", "every_ms": 60000},
            "message": "cron ping",
            "enabled": False,
        },
    )
    job_id = created.json()["job"]["id"]
    ran = client.post(f"/api/webui/automations/{job_id}/run", headers=auth_headers)
    assert ran.status_code == 200, ran.text
    assert ran.json()["job"]["state"]["last_status"] == "ok"
    msgs = client.get(f"/api/sessions/{sid}/messages", headers=auth_headers).json()
    texts = [m.get("content") for m in msgs.get("messages") or []]
    assert any("cron ping" in str(t) for t in texts)
