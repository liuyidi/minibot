"""Human-in-the-loop pause / approve / resume coverage."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fake_provider import FakeProvider, text_response, tool_response
from minibot.agent.loop import AgentLoop
from minibot.agent.runner import AgentRunner
from minibot.agent.tools.builtin import register_default_tools
from minibot.config.app_config import AppConfig
from minibot.session.store import SessionStore


def test_write_tool_waits_for_approval_then_resumes(tmp_path: Path) -> None:
    provider = FakeProvider(
        responses=[
            tool_response("write_file", {"path": "approved.txt", "content": "safe"}),
            text_response("The file was written."),
        ]
    )
    sessions = SessionStore(tmp_path)
    session = sessions.create(workspace=tmp_path)
    loop = AgentLoop(
        sessions=sessions,
        tools=register_default_tools(),
        runner=AgentRunner(provider),
        config=AppConfig(),
    )

    async def run() -> None:
        paused = await loop.handle_turn(session.id, "write the file")
        assert paused.stop_reason == "paused_for_approval"
        assert paused.approval_id
        assert not (tmp_path / "approved.txt").exists()
        pending = loop.approvals.get(paused.approval_id)
        assert pending is not None and pending.status == "pending"

        resumed = await loop.resolve_approval(paused.approval_id, "approve")
        assert resumed.content == "The file was written."
        assert (tmp_path / "approved.txt").read_text() == "safe"

    asyncio.run(run())


def test_rest_turn_returns_approval_and_rest_resolve(
    client, auth_headers, fake_provider: FakeProvider, data_dir: Path
) -> None:
    """REST clients receive the pending approval inline and can resume it by REST."""
    fake_provider.responses = [
        tool_response("write_file", {"path": "rest-approved.txt", "content": "ok"}),
        text_response("REST flow completed."),
    ]
    created = client.post(
        "/api/sessions",
        headers=auth_headers,
        json={"workspace_path": str(data_dir)},
    )
    assert created.status_code == 200
    session_id = created.json()["id"]

    turn = client.post(
        f"/api/sessions/{session_id}/turns",
        headers=auth_headers,
        json={"content": "write a file"},
    )
    assert turn.status_code == 200
    payload = turn.json()
    assert payload["stop_reason"] == "paused_for_approval"
    assert payload["approval"]["tool_calls"][0]["name"] == "write_file"
    assert not (data_dir / "rest-approved.txt").exists()

    resolved = client.post(
        f"/api/approvals/{payload['approval_id']}/resolve",
        headers=auth_headers,
        json={"decision": "approve"},
    )
    assert resolved.status_code == 200
    resolved_payload = resolved.json()
    assert resolved_payload["user_id"]
    assert resolved_payload["content"] == "REST flow completed."
    assert (data_dir / "rest-approved.txt").read_text() == "ok"
