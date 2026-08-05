"""Signed media helpers for the WebUI HTTP surface."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import mimetypes
import os
import re
import shutil
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

from fastapi import Request, Response
from fastapi.responses import Response as FastAPIResponse

from minibot.channels.helpers import safe_filename
from minibot.channels.paths import get_media_dir

MediaDirProvider = Callable[[str | None], Path]
SignedMediaPath = Callable[[Path], dict[str, str] | None]
SignedMediaUrl = Callable[[Path], str | None]

_MEDIA_ALLOWED_MIMES: frozenset[str] = frozenset({
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "video/mp4",
    "video/webm",
    "video/quicktime",
})
_SVG_MEDIA_HEADERS: dict[str, str] = {
    "Content-Security-Policy": (
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
    ),
}

_BYTE_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(value: str) -> bytes:
    pad = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + pad)


def _default_media_dir(channel: str | None = None) -> Path:
    return get_media_dir(channel)


def _parse_single_byte_range(range_header: str, size: int) -> tuple[int, int]:
    if size <= 0 or "," in range_header:
        raise ValueError("invalid byte range")
    m = _BYTE_RANGE_RE.fullmatch(range_header.strip())
    if m is None:
        raise ValueError("invalid byte range")
    start_text, end_text = m.groups()
    if not start_text and not end_text:
        raise ValueError("invalid byte range")
    if not start_text:
        suffix_length = int(end_text)
        if suffix_length <= 0:
            raise ValueError("invalid byte range")
        start = max(size - suffix_length, 0)
        end = size - 1
    else:
        start = int(start_text)
        end = int(end_text) if end_text else size - 1
        if start >= size or start > end:
            raise ValueError("invalid byte range")
        end = min(end, size - 1)
    return start, end


def sign_media_path(
    abs_path: Path,
    *,
    secret: bytes,
    media_dir: MediaDirProvider = _default_media_dir,
) -> str | None:
    try:
        media_root = media_dir(None).resolve()
        rel = abs_path.resolve().relative_to(media_root)
    except (OSError, ValueError):
        return None
    payload = b64url_encode(rel.as_posix().encode("utf-8"))
    mac = hmac.new(secret, payload.encode("ascii"), hashlib.sha256).digest()[:16]
    return f"/api/media/{b64url_encode(mac)}/{payload}"


def sign_or_stage_media_path(
    path: Path,
    *,
    secret: bytes,
    media_dir: MediaDirProvider = _default_media_dir,
    logger: Any | None = None,
) -> dict[str, str] | None:
    signed = sign_media_path(path, secret=secret, media_dir=media_dir)
    if signed is not None:
        return {"url": signed, "name": path.name}
    staged_tmp: Path | None = None
    try:
        resolved = path.resolve(strict=True)
        if not resolved.is_file():
            return None
        source_stat = resolved.stat()
        target_dir = media_dir("websocket")
        safe_name = safe_filename(path.name) or "attachment"
        source_version = "\0".join((
            os.path.normcase(str(resolved)),
            str(source_stat.st_size),
            str(source_stat.st_mtime_ns),
            str(source_stat.st_ctime_ns),
        ))
        source_digest = hashlib.sha256(source_version.encode("utf-8")).hexdigest()[:20]
        staged = target_dir / f"{source_digest}-{safe_name}"
        if not staged.is_file() or staged.stat().st_size != source_stat.st_size:
            staged_tmp = target_dir / f".{source_digest}-{uuid.uuid4().hex}.tmp"
            shutil.copyfile(resolved, staged_tmp)
            staged_tmp.replace(staged)
    except OSError as exc:
        if logger is not None:
            logger.warning("failed to stage outbound media %s: %s", path, exc)
        return None
    finally:
        if staged_tmp is not None:
            staged_tmp.unlink(missing_ok=True)
    signed = sign_media_path(staged, secret=secret, media_dir=media_dir)
    if signed is None:
        return None
    return {"url": signed, "name": path.name}


def media_attachment_kind(name: str) -> str:
    mime, _ = mimetypes.guess_type(name)
    if mime and mime.startswith("video/"):
        return "video"
    if mime and mime.startswith("image/"):
        return "image"
    return "file"


def signed_media_attachments(
    paths: list[str],
    *,
    sign_path: SignedMediaPath,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for pstr in paths:
        path = Path(pstr)
        att = sign_path(path)
        if att is None:
            continue
        url = att.get("url")
        if not url:
            continue
        name = att.get("name") or path.name
        out.append({"kind": media_attachment_kind(name), "url": url, "name": name})
    return out


def attach_signed_media_urls(
    payload: dict[str, Any],
    *,
    sign_path: SignedMediaUrl,
) -> None:
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return
    raw_messages = cast(list[Any], messages)
    for msg in raw_messages:
        if not isinstance(msg, dict):
            continue
        message = cast(dict[str, Any], msg)
        media = message.get("media")
        if not isinstance(media, list) or not media:
            continue
        media_entries = cast(list[Any], media)
        urls: list[dict[str, str]] = []
        for entry in media_entries:
            if not isinstance(entry, str) or not entry:
                continue
            signed = sign_path(Path(entry))
            if signed is None:
                continue
            urls.append({"url": signed, "name": Path(entry).name})
        if urls:
            message["media_urls"] = urls
        message.pop("media", None)


def _http_error(status: int, detail: str) -> Response:
    return FastAPIResponse(content=detail, status_code=status, media_type="text/plain")


def serve_signed_media(
    sig: str,
    payload: str,
    *,
    secret: bytes,
    request: Request | None = None,
    media_dir: MediaDirProvider = _default_media_dir,
) -> Response:
    try:
        provided_mac = b64url_decode(sig)
    except (ValueError, binascii.Error):
        return _http_error(401, "invalid signature")
    expected_mac = hmac.new(secret, payload.encode("ascii"), hashlib.sha256).digest()[:16]
    if not hmac.compare_digest(expected_mac, provided_mac):
        return _http_error(401, "invalid signature")
    try:
        rel_bytes = b64url_decode(payload)
        rel_str = rel_bytes.decode("utf-8")
    except (ValueError, binascii.Error, UnicodeDecodeError):
        return _http_error(400, "invalid payload")
    try:
        media_root = media_dir(None).resolve()
        candidate = (media_root / rel_str).resolve()
        candidate.relative_to(media_root)
    except (OSError, ValueError):
        return _http_error(404, "not found")
    if not candidate.is_file():
        return _http_error(404, "not found")

    mime, _ = mimetypes.guess_type(candidate.name)
    if mime not in _MEDIA_ALLOWED_MIMES:
        mime = "application/octet-stream"
    headers: dict[str, str] = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
    }
    if mime == "image/svg+xml":
        headers.update(_SVG_MEDIA_HEADERS)
    try:
        size = candidate.stat().st_size
    except OSError:
        return _http_error(500, "read error")

    range_header = (request.headers.get("range") or "") if request is not None else ""
    if range_header:
        try:
            start, end = _parse_single_byte_range(range_header, size)
        except ValueError:
            return FastAPIResponse(
                content=b"range not satisfiable",
                status_code=416,
                media_type="text/plain",
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Range": f"bytes */{size}",
                    "X-Content-Type-Options": "nosniff",
                },
            )
        try:
            length = end - start + 1
            with candidate.open("rb") as fh:
                fh.seek(start)
                body = fh.read(length)
        except OSError:
            return _http_error(500, "read error")
        return FastAPIResponse(
            content=body,
            status_code=206,
            media_type=mime,
            headers={
                **headers,
                "Content-Range": f"bytes {start}-{end}/{size}",
            },
        )

    try:
        body = candidate.read_bytes()
    except OSError:
        return _http_error(500, "read error")
    return FastAPIResponse(content=body, media_type=mime, headers=headers)
