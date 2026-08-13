"""Slash command listing endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_api_commands_includes_compact(client: TestClient, auth_headers: dict[str, str]) -> None:
    res = client.get("/api/commands", headers=auth_headers)
    assert res.status_code == 200
    commands = res.json()["commands"]
    compact = next((c for c in commands if c["command"] == "/compact"), None)
    assert compact is not None
    assert compact["title"]
    assert compact["description"]
