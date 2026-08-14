"""Resolve and serve the minibot WebUI SPA."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

# Paths that must never be swallowed by the SPA fallback.
_SPA_RESERVED_PREFIXES = (
    "api/",
    "auth/",
    "status",
    "webui/",
    "ws",
    "ui/",
    "health",
    "docs",
    "openapi.json",
    "redoc",
)


def resolve_webui_dist() -> Path | None:
    """Return directory containing WebUI ``index.html``, or None."""
    env = (os.environ.get("MINIBOT_WEBUI_DIST") or "").strip()
    candidates: list[Path] = []
    if env:
        candidates.append(Path(env).expanduser())
    # Packaged alongside DevUI (Docker copies dist here).
    here = Path(__file__).resolve().parent
    candidates.append(here / "static" / "webui")
    # Monorepo checkout: walk up until ``webui/dist/index.html`` exists.
    # ``minibot/src/minibot/webui_static.py`` → repo root is ``parents[2]``.
    for parent in here.parents:
        candidates.append(parent / "webui" / "dist")
    seen: set[Path] = set()
    for path in candidates:
        try:
            resolved = path.expanduser().resolve()
        except OSError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        if (resolved / "index.html").is_file():
            return resolved
    return None


def mount_webui(app: FastAPI) -> Path | None:
    """Serve WebUI at ``/`` when dist exists; otherwise leave caller to redirect ``/`` → ``/ui/``."""
    dist = resolve_webui_dist()
    if dist is None:
        return None

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="webui-assets")

    index = dist / "index.html"

    @app.get("/")
    async def spa_index() -> FileResponse:
        return FileResponse(index, media_type="text/html")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith(_SPA_RESERVED_PREFIXES) or full_path in {
            "health",
            "docs",
            "openapi.json",
            "redoc",
        }:
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (dist / full_path).resolve()
        try:
            candidate.relative_to(dist)
        except ValueError as exc:
            raise HTTPException(status_code=403, detail="Forbidden") from exc
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index, media_type="text/html")

    return dist


def root_redirect_to_devui() -> RedirectResponse:
    return RedirectResponse(url="/ui/")
