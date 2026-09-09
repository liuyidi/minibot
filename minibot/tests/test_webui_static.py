"""Tests for WebUI dist resolution / reserved SPA paths."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from minibot.webui_static import mount_webui, resolve_webui_dist


def test_resolve_webui_dist_env(tmp_path: Path, monkeypatch) -> None:
    index = tmp_path / "index.html"
    index.write_text("<html></html>", encoding="utf-8")
    monkeypatch.setenv("MINIBOT_WEBUI_DIST", str(tmp_path))
    assert resolve_webui_dist() == tmp_path.resolve()


def test_resolve_webui_dist_finds_monorepo_checkout() -> None:
    """``minibot/src/minibot`` checkout must resolve repo ``webui/dist``."""
    path = resolve_webui_dist()
    assert path is not None
    assert path.name == "dist"
    assert path.parent.name == "webui"
    assert (path / "index.html").is_file()


def test_assets_cache_control_header(tmp_path: Path, monkeypatch) -> None:
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "index.html").write_text("<html></html>", encoding="utf-8")
    monkeypatch.setenv("MINIBOT_WEBUI_DIST", str(tmp_path))

    app = FastAPI()
    assert mount_webui(app) is not None
    client = TestClient(app)
    res = client.get("/assets/app.js")
    assert res.status_code == 200
    assert "immutable" in res.headers.get("cache-control", "")
