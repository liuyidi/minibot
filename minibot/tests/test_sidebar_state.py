"""Sidebar-state persistence (Phase 8.3) — pin / archive / rename metadata."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def test_sidebar_state_defaults_when_missing(
    client: TestClient, auth_headers: dict[str, str], data_dir: Path
) -> None:
    res = client.get("/api/webui/sidebar-state", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["schema_version"] == 1
    assert body["archived_keys"] == []
    assert body["pinned_keys"] == []
    assert body["view"]["show_archived"] is False
    assert not (data_dir / "webui" / "sidebar-state.json").exists()


def test_sidebar_state_update_persists_archive_and_reload(
    client: TestClient, auth_headers: dict[str, str], data_dir: Path
) -> None:
    payload = {
        "schema_version": 1,
        "pinned_keys": ["websocket:chat-b"],
        "archived_keys": ["websocket:feishu:ou_peer"],
        "title_overrides": {"websocket:feishu:ou_peer": "客户支持"},
        "project_name_overrides": {},
        "tags_by_key": {},
        "collapsed_groups": {},
        "view": {
            "density": "comfortable",
            "show_previews": False,
            "show_timestamps": False,
            "show_archived": False,
            "sort": "updated_desc",
        },
        "updated_at": None,
    }
    update = client.post(
        "/api/webui/sidebar-state/update",
        headers=auth_headers,
        json=payload,
    )
    assert update.status_code == 200
    saved = update.json()
    assert saved["archived_keys"] == ["websocket:feishu:ou_peer"]
    assert saved["pinned_keys"] == ["websocket:chat-b"]
    assert saved["title_overrides"]["websocket:feishu:ou_peer"] == "客户支持"
    assert saved["updated_at"]

    path = data_dir / "webui" / "sidebar-state.json"
    assert path.is_file()

    reload = client.get("/api/webui/sidebar-state", headers=auth_headers)
    assert reload.status_code == 200
    assert reload.json()["archived_keys"] == ["websocket:feishu:ou_peer"]


def test_sidebar_state_update_legacy_get_query_still_works(
    client: TestClient, auth_headers: dict[str, str], data_dir: Path
) -> None:
    payload = {
        "schema_version": 1,
        "pinned_keys": [],
        "archived_keys": ["websocket:legacy"],
        "title_overrides": {},
        "project_name_overrides": {},
        "tags_by_key": {},
        "collapsed_groups": {},
        "view": {
            "density": "comfortable",
            "show_previews": False,
            "show_timestamps": False,
            "show_archived": False,
            "sort": "updated_desc",
        },
        "updated_at": None,
    }
    update = client.get(
        "/api/webui/sidebar-state/update",
        headers=auth_headers,
        params={"state": json.dumps(payload)},
    )
    assert update.status_code == 200
    assert update.json()["archived_keys"] == ["websocket:legacy"]


def test_sidebar_state_update_rejects_missing_state(
    client: TestClient, auth_headers: dict[str, str], data_dir: Path
) -> None:
    res = client.get("/api/webui/sidebar-state/update", headers=auth_headers)
    assert res.status_code == 400
