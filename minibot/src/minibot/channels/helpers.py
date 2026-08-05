"""Small helpers used by channel adapters."""

from __future__ import annotations

import logging
import re
from pathlib import Path

_UNSAFE_CHARS = re.compile(r"[^\w.\-]+", re.UNICODE)
log = logging.getLogger("minibot.channels")


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def safe_filename(name: str) -> str:
    return _UNSAFE_CHARS.sub("_", name).strip()


def redirect_lib_logging(_prefix: str) -> None:
    """No-op stub (nanobot bridged third-party logs into loguru)."""
    return
