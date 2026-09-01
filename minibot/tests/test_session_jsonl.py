"""Phase 0.1: SessionStore JSONL persistence."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fake_provider import text_response
from fastapi.testclient import TestClient

from minibot.config.settings import get_settings
from minibot.main import create_app
from minibot.session.store import SessionStore


def test_create_writes_jsonl_file(tmp_path: Path) -> None:
    store = SessionStore(data_dir=tmp_path)
    session = store.create(title="hello")

    path = tmp_path / "sessions" / f"{session.id}.jsonl"
    assert path.is_file()
    lines = path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) >= 1
    meta = json.loads(lines[0])
    assert meta["_type"] == "metadata"
    assert meta["id"] == session.id
    assert meta["title"] == "hello"


def test_append_survives_new_store_instance(tmp_path: Path) -> None:
    store = SessionStore(data_dir=tmp_path)
    session = store.create()
    store.append_messages(
        session.id,
        [
            {"role": "user", "content": "ping"},
            {"role": "assistant", "content": "pong"},
        ],
    )

    reloaded = SessionStore(data_dir=tmp_path)
    found = reloaded.get(session.id)
    assert found is not None
    assert found.messages == [
        {"role": "user", "content": "ping"},
        {"role": "assistant", "content": "pong"},
    ]
    assert found.title == "ping"
    listed = reloaded.list()
    assert any(s.id == session.id for s in listed)
    assert listed[0].preview() == "ping"


def test_delete_removes_file_and_cache(tmp_path: Path) -> None:
    store = SessionStore(data_dir=tmp_path)
    session = store.create()
    path = tmp_path / "sessions" / f"{session.id}.jsonl"
    assert path.exists()

    assert store.delete(session.id) is True
    assert not path.exists()
    assert store.get(session.id) is None
    assert store.delete(session.id) is False


def test_create_with_explicit_id(tmp_path: Path) -> None:
    store = SessionStore(data_dir=tmp_path)
    session = store.create(session_id="custom-chat-1", title="t")
    assert session.id == "custom-chat-1"
    assert (tmp_path / "sessions" / "custom-chat-1.jsonl").is_file()

    again = SessionStore(data_dir=tmp_path).get("custom-chat-1")
    assert again is not None
    assert again.title == "t"


def test_api_sessions_survive_app_restart(
    tmp_path: Path,
    fake_provider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    monkeypatch.setattr(
        "minibot.providers.factory.build_provider",
        lambda **_kwargs: fake_provider,
    )

    app1 = create_app()
    with TestClient(app1) as client:
        boot = client.get("/auth/bootstrap")
        headers = {"Authorization": f"Bearer {boot.json()['token']}"}
        created = client.post("/api/sessions", headers=headers, json={"title": "persist-me"})
        assert created.status_code == 200
        session_id = created.json()["id"]
        turn = client.post(
            f"/api/sessions/{session_id}/turns",
            headers=headers,
            json={"content": "remember this"},
        )
        assert turn.status_code == 200

    get_settings.cache_clear()
    # Second process: new app instance, same data_dir
    fake_provider.push(text_response("unused"))
    app2 = create_app()
    with TestClient(app2) as client:
        boot = client.get("/auth/bootstrap")
        headers = {"Authorization": f"Bearer {boot.json()['token']}"}
        listed = client.get("/api/sessions", headers=headers)
        assert listed.status_code == 200
        ids = [s["id"] for s in listed.json()["sessions"]]
        assert session_id in ids

        messages = client.get(f"/api/sessions/{session_id}/messages", headers=headers)
        assert messages.status_code == 200
        roles = [m["role"] for m in messages.json()["messages"]]
        assert "user" in roles
        assert "assistant" in roles
        assert any(m.get("content") == "remember this" for m in messages.json()["messages"])

    get_settings.cache_clear()


def test_messages_before_user_index_keeps_tool_turns(tmp_path: Path) -> None:
    from minibot.session.store import messages_before_user_index

    history = [
        {"role": "user", "content": "u0"},
        {"role": "assistant", "content": "", "tool_calls": [{"id": "1"}]},
        {"role": "tool", "tool_call_id": "1", "name": "echo", "content": "ok"},
        {"role": "assistant", "content": "a0"},
        {"role": "user", "content": "u1"},
        {"role": "assistant", "content": "a1"},
    ]
    assert messages_before_user_index(history, 0) == []
    assert [m["role"] for m in messages_before_user_index(history, 1)] == [
        "user",
        "assistant",
        "tool",
        "assistant",
    ]
    assert messages_before_user_index(history, 2) == history
    assert messages_before_user_index(history, 99) == history


def test_fork_from_is_non_destructive_and_sets_boundary(tmp_path: Path) -> None:
    store = SessionStore(data_dir=tmp_path)
    source = store.create(title="src", session_id="src-chat")
    store.append_messages(
        source.id,
        [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "reply-1"},
            {"role": "user", "content": "second"},
            {"role": "assistant", "content": "reply-2"},
        ],
    )

    forked = store.fork_from(
        source.id,
        before_user_index=1,
        title="Fork of src",
    )
    assert forked.id != source.id
    assert forked.title == "Fork of src"
    assert forked.messages == [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "reply-1"},
    ]
    assert forked.fork_boundary_message_count == 2

    original = store.get(source.id)
    assert original is not None
    assert len(original.messages) == 4

    reloaded = SessionStore(data_dir=tmp_path).get(forked.id)
    assert reloaded is not None
    assert reloaded.fork_boundary_message_count == 2
    assert len(reloaded.messages) == 2
