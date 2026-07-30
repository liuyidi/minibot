"""Dev UI memory / skills pages + APIs."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_dev_memory_and_skills_pages(client: TestClient) -> None:
    assert client.get("/ui/memory.html").status_code == 200
    assert client.get("/ui/skills.html").status_code == 200
    mem_page = client.get("/ui/memory.html").text
    assert "/api/dev/memory" in mem_page
    skills_page = client.get("/ui/skills.html").text
    assert "/api/dev/skills" in skills_page


def test_dev_memory_api_roundtrip(client: TestClient, auth_headers: dict[str, str]) -> None:
    empty = client.get("/api/dev/memory", headers=auth_headers)
    assert empty.status_code == 200
    body = empty.json()
    assert body["ok"] is True
    assert "path" in body

    written = client.post(
        "/api/dev/memory",
        headers=auth_headers,
        json={"content": "debug-pref-kiwi", "mode": "replace"},
    )
    assert written.status_code == 200
    assert "kiwi" in written.json()["text"]

    again = client.get("/api/dev/memory", headers=auth_headers)
    assert "kiwi" in again.json()["text"]


def test_dev_skills_api(client: TestClient, auth_headers: dict[str, str]) -> None:
    res = client.get("/api/dev/skills", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["installed_count"] >= 3
    names = {s["name"] for s in data["skills"]}
    assert "memory" in names

    detail = client.get("/api/dev/skills", headers=auth_headers, params={"name": "memory"})
    assert detail.status_code == 200
    assert detail.json()["detail"]["name"] == "memory"
    assert "MEMORY.md" in (detail.json()["detail"]["body"] or "")
