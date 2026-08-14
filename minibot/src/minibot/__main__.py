"""CLI entry: ``python -m minibot`` or ``minibot``."""

from __future__ import annotations

import sys

import uvicorn

from minibot.config.settings import get_settings


def main() -> None:
    settings = get_settings()
    # Frozen sidecars: pass the app object. A string target re-imports via
    # importlib and fails if package datas shadow PYZ modules.
    if getattr(sys, "frozen", False):
        from minibot.main import app

        app_target: object = app
    else:
        app_target = "minibot.main:app"
    uvicorn.run(
        app_target,
        host=settings.host,
        port=settings.port,
        reload=False,
        # iOS / Expo Go URLSessionWebSocketTask mishandles permessage-deflate
        # extension negotiation and closes the socket with 1006. Disable it.
        ws_per_message_deflate=False,
    )


if __name__ == "__main__":
    main()
