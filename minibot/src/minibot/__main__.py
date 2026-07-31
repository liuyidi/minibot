"""CLI entry: ``python -m minibot`` or ``minibot``."""

from __future__ import annotations

import uvicorn

from minibot.config.settings import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "minibot.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        # iOS / Expo Go URLSessionWebSocketTask mishandles permessage-deflate
        # extension negotiation and closes the socket with 1006. Disable it.
        ws_per_message_deflate=False,
    )


if __name__ == "__main__":
    main()
