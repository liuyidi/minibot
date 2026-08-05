"""Phase 8.1 media / file-preview tests."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from minibot.webui.attachment_ingress import store_inbound_attachments
from minibot.webui.media_api import b64url_decode, sign_media_path

_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x00\x00\x02\x00\x01"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _png_data_url() -> str:
    return f"data:image/png;base64,{base64.b64encode(_PNG_BYTES).decode()}"


def _fake_media_dir(root: Path):
    def inner(channel: str | None = None) -> Path:
        path = root / (channel or "")
        path.mkdir(parents=True, exist_ok=True)
        return path

    return inner


def test_sign_media_path_and_get(client: TestClient, data_dir: Path) -> None:
    media_root = data_dir / "media"
    media_root.mkdir(parents=True)
    target = media_root / "a.png"
    target.write_bytes(_PNG_BYTES)

    gateway = client.app.state.app_state.media_gateway
    assert gateway is not None
    gateway._media_dir = _fake_media_dir(media_root)  # noqa: SLF001

    signed = gateway.sign_media_path(target)
    assert signed is not None
    assert signed.startswith("/api/media/")
    sig, payload = signed[len("/api/media/") :].split("/", 1)
    expected = hmac.new(gateway.secret, payload.encode("ascii"), hashlib.sha256).digest()[:16]
    assert b64url_decode(sig) == expected

    res = client.get(signed)
    assert res.status_code == 200
    assert res.content == _PNG_BYTES
    assert res.headers["content-type"].startswith("image/png")


def test_sign_rejects_outside_media_root(data_dir: Path) -> None:
    media_root = data_dir / "media"
    media_root.mkdir()
    outside = data_dir / "secret.txt"
    outside.write_text("nope")
    secret = b"test-secret-32-bytes-long!!!!!!"
    assert sign_media_path(outside, secret=secret, media_dir=_fake_media_dir(media_root)) is None


def test_store_inbound_attachments(data_dir: Path) -> None:
    media_dir = data_dir / "media" / "websocket"
    media_dir.mkdir(parents=True)
    logger = logging.getLogger("test")
    paths, reason = store_inbound_attachments(
        [{"data_url": _png_data_url(), "name": "shot.png"}],
        media_dir=media_dir,
        logger=logger,
    )
    assert reason is None
    assert len(paths) == 1
    saved = Path(paths[0])
    assert saved.is_file()
    assert saved.read_bytes() == _PNG_BYTES


def test_file_preview_workspace_and_forbidden(
    client: TestClient,
    auth_headers: dict[str, str],
    data_dir: Path,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    sample = workspace / "hello.py"
    sample.write_text("print('hi')\n", encoding="utf-8")
    outside = tmp_path / "outside.txt"
    outside.write_text("secret", encoding="utf-8")

    created = client.post(
        "/api/sessions",
        headers=auth_headers,
        json={"title": "preview", "workspace_path": str(workspace)},
    )
    assert created.status_code == 200
    session_id = created.json()["id"]

    ok = client.get(
        f"/api/sessions/{session_id}/file-preview",
        headers=auth_headers,
        params={"path": "hello.py"},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["content"] == "print('hi')\n"
    assert body["language"] == "python"

    probe = client.get(
        f"/api/sessions/{session_id}/file-preview",
        headers=auth_headers,
        params={"path": "hello.py", "probe": "1"},
    )
    assert probe.status_code == 200
    assert probe.json()["available"] is True

    forbidden = client.get(
        f"/api/sessions/{session_id}/file-preview",
        headers=auth_headers,
        params={"path": str(outside)},
    )
    assert forbidden.status_code == 403


def test_webui_thread_includes_signed_images(
    client: TestClient,
    auth_headers: dict[str, str],
    data_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_root = data_dir / "media"
    media_root.mkdir(parents=True)
    saved = media_root / "websocket" / "img.png"
    saved.parent.mkdir(parents=True)
    saved.write_bytes(_PNG_BYTES)

    gateway = client.app.state.app_state.media_gateway
    assert gateway is not None
    gateway._media_dir = _fake_media_dir(media_root)  # noqa: SLF001

    created = client.post("/api/sessions", headers=auth_headers, json={})
    session_id = created.json()["id"]
    state = client.app.state.app_state
    state.sessions.append_messages(
        session_id,
        [{"role": "user", "content": "see image", "media": [str(saved)]}],
    )

    res = client.get(f"/api/sessions/{session_id}/webui-thread", headers=auth_headers)
    assert res.status_code == 200
    messages = res.json()["messages"]
    assert len(messages) == 1
    assert messages[0]["content"] == "see image"
    assert messages[0]["images"][0]["url"].startswith("/api/media/")
    assert messages[0]["media"][0]["kind"] == "image"


def test_rest_turn_persists_media_paths(
    client: TestClient,
    auth_headers: dict[str, str],
    data_dir: Path,
) -> None:
    media_root = data_dir / "media"
    media_root.mkdir(parents=True)
    saved = media_root / "websocket" / "turn.png"
    saved.parent.mkdir(parents=True)
    saved.write_bytes(_PNG_BYTES)

    created = client.post("/api/sessions", headers=auth_headers, json={})
    session_id = created.json()["id"]

    turn = client.post(
        f"/api/sessions/{session_id}/turns",
        headers=auth_headers,
        json={"content": "describe", "media": [str(saved)]},
    )
    assert turn.status_code == 200

    # /messages rewrites disk paths → signed media_urls without mutating the store.
    api_msgs = client.get(f"/api/sessions/{session_id}/messages", headers=auth_headers).json()["messages"]
    api_user = [m for m in api_msgs if m.get("role") == "user"][-1]
    assert "media" not in api_user
    assert api_user["media_urls"][0]["url"].startswith("/api/media/")
    assert api_user["media_urls"][0]["name"] == "turn.png"

    session = client.app.state.app_state.sessions.get(session_id)
    assert session is not None
    user_msgs = [m for m in session.messages if m.get("role") == "user"]
    assert user_msgs
    assert user_msgs[-1].get("media") == [str(saved)]


def test_media_only_turn_allowed(
    client: TestClient,
    auth_headers: dict[str, str],
    data_dir: Path,
) -> None:
    media_root = data_dir / "media"
    media_root.mkdir(parents=True)
    saved = media_root / "websocket" / "only.png"
    saved.parent.mkdir(parents=True)
    saved.write_bytes(_PNG_BYTES)

    created = client.post("/api/sessions", headers=auth_headers, json={})
    session_id = created.json()["id"]

    turn = client.post(
        f"/api/sessions/{session_id}/turns",
        headers=auth_headers,
        json={"content": "", "media": [str(saved)]},
    )
    assert turn.status_code == 200

    session = client.app.state.app_state.sessions.get(session_id)
    assert session is not None
    user_msgs = [m for m in session.messages if m.get("role") == "user"]
    assert user_msgs[-1]["content"] == ""
    assert user_msgs[-1]["media"] == [str(saved)]


def test_ws_message_stores_media(
    client: TestClient, auth_headers: dict[str, str], data_dir: Path
) -> None:
    created = client.post("/api/sessions", headers=auth_headers, json={})
    session_id = created.json()["id"]
    token = auth_headers["Authorization"].removeprefix("Bearer ").strip()

    with client.websocket_connect(f"/ws?token={token}") as ws:
        ready = ws.receive_json()
        assert ready.get("event") == "ready"
        ws.send_json(
            {
                "type": "message",
                "chat_id": session_id,
                "content": "",
                "media": [{"data_url": _png_data_url(), "name": "ws.png"}],
            }
        )
        for _ in range(40):
            frame = ws.receive_json()
            if frame.get("event") == "turn_error":
                pytest.fail(frame.get("detail"))
            if frame.get("event") == "goal_status" and frame.get("status") == "idle":
                break

    session = client.app.state.app_state.sessions.get(session_id)
    assert session is not None
    user_msgs = [m for m in session.messages if m.get("role") == "user"]
    assert user_msgs[-1]["media"]
    assert Path(user_msgs[-1]["media"][0]).is_file()
