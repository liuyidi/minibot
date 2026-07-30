"""Phase 0.6: trace timing + usage plumbing."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_rest_turn_trace_has_timing_and_usage(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post("/api/sessions", headers=auth_headers, json={})
    sid = created.json()["id"]
    turn = client.post(
        f"/api/sessions/{sid}/turns",
        headers=auth_headers,
        json={"content": "hello timing"},
    )
    assert turn.status_code == 200
    trace = turn.json()["trace"]
    assert trace
    for step in trace:
        assert "t_start" in step
        assert "t_end" in step
        assert step["t_end"] >= step["t_start"]
    starts = [s["t_start"] for s in trace]
    assert starts == sorted(starts)
    final = next(s for s in trace if s["type"] == "llm_final")
    assert final.get("usage")
    assert final["usage"]["prompt_tokens"] == 12
    assert final["usage"]["completion_tokens"] == 4


def test_trace_page_mentions_phase_06(client: TestClient) -> None:
    page = client.get("/ui/trace.html")
    assert page.status_code == 200
    assert "Phase 0.6" in page.text or "t_start" in page.text
    assert "usage" in page.text.lower()
    common = client.get("/ui/common.js")
    assert "usageLabel" in common.text
