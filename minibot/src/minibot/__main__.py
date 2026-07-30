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
    )


if __name__ == "__main__":
    main()
