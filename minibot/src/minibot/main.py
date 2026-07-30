"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from minibot.api.routes import auth, automations, misc, sessions, settings, status, workspaces
from minibot.api.ws import router as ws_router
from minibot.app_state import build_app_state
from minibot.webui_static import mount_webui, root_redirect_to_devui

_DEVUI_DIR = Path(__file__).resolve().parent / "static" / "devui"


@asynccontextmanager
async def lifespan(app: FastAPI):
    from minibot.observability import langfuse as lf

    state = build_app_state()
    app.state.app_state = state
    lf.init_from_settings(state.settings)
    if state.bus_worker is not None:
        state.bus_worker.start()
    try:
        await state.mcp.start(state.config.mcp_presets or [])
    except Exception:  # noqa: BLE001 — never block boot on MCP
        pass
    if state.cron is not None:
        try:
            await state.cron.start()
        except Exception:  # noqa: BLE001 — never block boot on cron store
            pass
    try:
        yield
    finally:
        if state.cron is not None:
            with suppress(Exception):
                await state.cron.stop()
        with suppress(Exception):
            await state.mcp.stop()
        if state.bus_worker is not None:
            await state.bus_worker.stop()
        lf.shutdown()


def create_app() -> FastAPI:
    app = FastAPI(title="minibot", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "runtime": "minibot"}

    app.include_router(auth.router)
    app.include_router(sessions.router)
    app.include_router(workspaces.router)
    app.include_router(settings.router)
    app.include_router(misc.router)
    app.include_router(automations.router)
    app.include_router(status.router)
    app.include_router(ws_router)

    if _DEVUI_DIR.is_dir():
        app.mount("/ui", StaticFiles(directory=str(_DEVUI_DIR), html=True), name="devui")

    # SPA last so /api /ws /ui win. If dist missing, / → DevUI.
    if mount_webui(app) is None:

        @app.get("/")
        async def root_fallback():
            return root_redirect_to_devui()

    return app


app = create_app()
