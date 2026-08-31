"""CLI Apps settings routes (catalog + install state)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient


def test_cli_apps_installed_only_empty(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from minibot.apps.cli import CliAppManager

    manager = CliAppManager(workspace=tmp_path, data_dir=tmp_path / "cli-apps")

    def _factory() -> CliAppManager:
        return manager

    monkeypatch.setattr("minibot.api.routes.settings._cli_app_manager", _factory)

    res = client.get("/api/settings/cli-apps?installed_only=1", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["apps"] == []
    assert body["installed_count"] == 0
    assert body.get("catalog_updated_at") is None


def test_cli_apps_payload_from_cached_registry(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from minibot.apps.cli import CliAppManager

    manager = CliAppManager(workspace=tmp_path, data_dir=tmp_path / "cli-apps")

    def fake_catalog(*, force_refresh: bool = False) -> tuple[list[dict[str, Any]], str | None]:
        del force_refresh
        return (
            [
                {
                    "name": "blender",
                    "display_name": "Blender",
                    "category": "3d",
                    "description": "3D creation",
                    "entry_point": "cli-anything-blender",
                    "package_manager": "pip",
                    "install_cmd": "pip install cli-anything-blender",
                    "_source": "harness",
                }
            ],
            "2026-08-31",
        )

    monkeypatch.setattr(manager, "catalog", fake_catalog)
    monkeypatch.setattr("minibot.api.routes.settings._cli_app_manager", lambda: manager)

    res = client.get("/api/settings/cli-apps", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["installed_count"] == 0
    assert body["catalog_updated_at"] == "2026-08-31"
    assert body["apps"][0]["name"] == "blender"
    assert body["apps"][0]["display_name"] == "Blender"
    assert body["apps"][0]["installed"] is False
    assert "manifest" in body["apps"][0]


def test_cli_apps_unknown_action_404(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from minibot.apps.cli import CliAppManager

    manager = CliAppManager(workspace=tmp_path, data_dir=tmp_path / "cli-apps")
    monkeypatch.setattr("minibot.api.routes.settings._cli_app_manager", lambda: manager)

    res = client.get("/api/settings/cli-apps/nope?name=blender", headers=auth_headers)
    assert res.status_code == 404
    assert "unknown" in res.json()["detail"].lower()
