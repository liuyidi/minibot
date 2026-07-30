"""Tests for WebUI dist resolution / reserved SPA paths."""

from __future__ import annotations

from pathlib import Path

from minibot.webui_static import resolve_webui_dist


def test_resolve_webui_dist_env(tmp_path: Path, monkeypatch) -> None:
    index = tmp_path / "index.html"
    index.write_text("<html></html>", encoding="utf-8")
    monkeypatch.setenv("MINIBOT_WEBUI_DIST", str(tmp_path))
    assert resolve_webui_dist() == tmp_path.resolve()


def test_resolve_webui_dist_missing(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("MINIBOT_WEBUI_DIST", str(tmp_path / "nope"))
    # May still find monorepo dist if present; only assert env miss doesn't crash
    path = resolve_webui_dist()
    if path is not None:
        assert (path / "index.html").is_file()
