"""PyInstaller entry for the desktop sidecar.

Sets ``MINIBOT_WEBUI_DIST`` when running from a frozen bundle so the gateway
serves the baked WebUI without relying on the monorepo layout.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _prepare_frozen_env() -> None:
    if not getattr(sys, "frozen", False):
        return
    base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    webui = base / "webui-dist"
    if webui.is_dir():
        os.environ.setdefault("MINIBOT_WEBUI_DIST", str(webui))


_prepare_frozen_env()

from minibot.__main__ import main  # noqa: E402


if __name__ == "__main__":
    main()
