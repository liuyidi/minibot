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


def test_write_tool_runs_without_approval(tmp_path: Path) -> None:
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
        result = await loop.handle_turn(session.id, "write the file")
        assert result.stop_reason != "paused_for_approval"
        assert result.content == "The file was written."
        assert (tmp_path / "approved.txt").read_text() == "safe"

    asyncio.run(run())


def test_escape_exec_waits_for_approval_then_resumes(tmp_path: Path) -> None:
    provider = FakeProvider(
        responses=[
            tool_response("exec", {"command": "cat /etc/passwd"}),
            text_response("Command finished."),
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
        paused = await loop.handle_turn(session.id, "read passwd")
        assert paused.stop_reason == "paused_for_approval"
        assert paused.approval_id
        pending = loop.approvals.get(paused.approval_id)
        assert pending is not None and pending.status == "pending"
        assert pending.tool_calls[0]["name"] == "exec"

        resumed = await loop.resolve_approval(paused.approval_id, "approve")
        assert resumed.content == "Command finished."

    asyncio.run(run())


def test_full_access_exec_does_not_wait_for_approval(tmp_path: Path) -> None:
    provider = FakeProvider(
        responses=[
            tool_response("exec", {"command": "cat /etc/passwd"}),
            text_response("Ran without asking."),
        ]
    )
    sessions = SessionStore(tmp_path)
    session = sessions.create(workspace=tmp_path, access_mode="full")
    loop = AgentLoop(
        sessions=sessions,
        tools=register_default_tools(),
        runner=AgentRunner(provider),
        config=AppConfig(),
    )

    async def run() -> None:
        result = await loop.handle_turn(session.id, "read passwd")
        assert result.stop_reason != "paused_for_approval"
        assert result.content == "Ran without asking."

    asyncio.run(run())


def test_rest_turn_returns_approval_and_rest_resolve(
    client, auth_headers, fake_provider: FakeProvider, data_dir: Path
) -> None:
    """REST clients receive the pending approval inline and can resume it by REST."""
    fake_provider.responses = [
        tool_response("exec", {"command": "sudo id"}),
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
        json={"content": "run privileged command"},
    )
    assert turn.status_code == 200
    payload = turn.json()
    assert payload["stop_reason"] == "paused_for_approval"
    assert payload["approval"]["tool_calls"][0]["name"] == "exec"
    assert payload["approval"]["tool_calls"][0]["arguments"]["command"] == "sudo id"

    resolved = client.post(
        f"/api/approvals/{payload['approval_id']}/resolve",
        headers=auth_headers,
        json={"decision": "approve"},
    )
    assert resolved.status_code == 200
    resolved_payload = resolved.json()
    assert resolved_payload["user_id"]
    assert resolved_payload["content"] == "REST flow completed."
