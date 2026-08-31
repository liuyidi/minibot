"""Performance smoke tests — coarse budgets for CI, not load testing."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from minibot.session.store import SessionStore

pytestmark = pytest.mark.perf


def test_health_endpoint_throughput(client: TestClient) -> None:
    start = time.perf_counter()
    for _ in range(100):
        res = client.get("/health")
        assert res.status_code == 200
    elapsed = time.perf_counter() - start
    # Generous for shared CI runners; tighten locally if needed.
    assert elapsed < 8.0, f"100x /health took {elapsed:.2f}s"


def test_session_list_latency(client: TestClient, auth_headers: dict[str, str]) -> None:
    for i in range(10):
        client.post("/api/sessions", headers=auth_headers, json={"title": f"perf-{i}"})

    start = time.perf_counter()
    for _ in range(30):
        res = client.get("/api/sessions", headers=auth_headers)
        assert res.status_code == 200
        assert isinstance(res.json().get("sessions"), list)
    elapsed = time.perf_counter() - start
    assert elapsed < 12.0, f"30x session list took {elapsed:.2f}s"


def test_session_store_create_and_list(tmp_path) -> None:
    store = SessionStore(data_dir=tmp_path)
    start = time.perf_counter()
    ids: list[str] = []
    for i in range(200):
        session = store.create(title=f"s-{i}")
        ids.append(session.id)
    listed = store.list()
    elapsed = time.perf_counter() - start
    assert len(listed) == len(ids)
    assert elapsed < 3.0, f"200 session creates + list took {elapsed:.2f}s"
