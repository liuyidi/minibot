"""Decode ``data:...;base64,...`` URLs to disk."""

from __future__ import annotations

import base64
import mimetypes
import re
import uuid
from pathlib import Path

from minibot.channels.helpers import safe_filename

DEFAULT_MAX_BYTES = 10 * 1024 * 1024

_DATA_URL_RE = re.compile(r"^data:([^;,]+)(?:;[^,]*)*;base64,(.+)$", re.DOTALL)
_MIME_EXTENSION_OVERRIDES = {
    "application/ogg": ".ogg",
    "audio/ogg": ".ogg",
    "audio/mpga": ".mpga",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-m4a": ".m4a",
    "audio/x-wav": ".wav",
    "audio/vnd.wave": ".wav",
    "video/webm": ".webm",
    "application/json": ".json",
    "application/pdf": ".pdf",
    "application/toml": ".toml",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/x-yaml": ".yaml",
    "application/xhtml+xml": ".html",
    "application/xml": ".xml",
    "application/yaml": ".yaml",
    "text/csv": ".csv",
    "text/html": ".html",
    "text/markdown": ".md",
    "text/plain": ".txt",
    "text/xml": ".xml",
    "text/yaml": ".yaml",
}


class FileSizeExceededError(Exception):
    """Raised when a decoded payload exceeds the caller's size limit."""


FileSizeExceeded = FileSizeExceededError


def detect_image_mime(data: bytes) -> str | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def save_base64_data_url(
    data_url: str,
    media_dir: Path,
    *,
    max_bytes: int | None = None,
    filename: str | None = None,
) -> str | None:
    m = _DATA_URL_RE.match(data_url)
    if not m:
        return None
    mime_type, b64_payload = m.group(1).strip().lower(), m.group(2)
    try:
        raw = base64.b64decode(b64_payload, validate=True)
    except Exception:
        return None
    if not raw:
        return None
    limit = DEFAULT_MAX_BYTES if max_bytes is None else max_bytes
    if len(raw) > limit:
        raise FileSizeExceeded(f"File exceeds {limit // (1024 * 1024)}MB limit")
    ext = _MIME_EXTENSION_OVERRIDES.get(mime_type) or mimetypes.guess_extension(mime_type) or ".bin"
    base = safe_filename(filename or "")
    stem = Path(base).stem[:80] if base else ""
    saved_name = f"{uuid.uuid4().hex[:12]}_{stem}{ext}" if stem else f"{uuid.uuid4().hex[:12]}{ext}"
    dest = media_dir / safe_filename(saved_name)
    dest.write_bytes(raw)
    return str(dest)
