"""Media gateway services shared by WebUI HTTP routes and WebSocket frames."""

from __future__ import annotations

import secrets
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import Request, Response

from minibot.channels.paths import get_media_dir
from minibot.webui.attachment_ingress import (
    AttachmentIngressResult,
    store_inbound_attachments,
)
from minibot.webui.ingress_policy import AttachmentIngressLimits
from minibot.webui.media_api import (
    attach_signed_media_urls,
    serve_signed_media,
    sign_media_path,
    sign_or_stage_media_path,
    signed_media_attachments,
)


def _default_media_dir(channel: str | None) -> Path:
    return get_media_dir(channel)


class WebUIMediaGateway:
    def __init__(
        self,
        *,
        logger: Any,
        media_dir: Callable[[str | None], Path] | None = None,
        secret: bytes | None = None,
        attachment_limits: AttachmentIngressLimits | None = None,
    ) -> None:
        self.logger = logger
        self._media_dir: Callable[[str | None], Path] = media_dir or _default_media_dir
        self.secret = secret or secrets.token_bytes(32)
        self.attachment_limits = attachment_limits or AttachmentIngressLimits()

    def store_inbound_attachments(self, media: list[Any]) -> AttachmentIngressResult:
        return store_inbound_attachments(
            media,
            media_dir=self._media_dir("websocket"),
            logger=self.logger,
            limits=self.attachment_limits,
        )

    def serve_signed_media(
        self,
        sig: str,
        payload: str,
        *,
        request: Request | None = None,
    ) -> Response:
        return serve_signed_media(
            sig,
            payload,
            secret=self.secret,
            request=request,
            media_dir=self._media_dir,
        )

    def sign_media_path(self, abs_path: Path) -> str | None:
        return sign_media_path(
            abs_path,
            secret=self.secret,
            media_dir=self._media_dir,
        )

    def sign_or_stage_media_path(self, path: Path) -> dict[str, str] | None:
        return sign_or_stage_media_path(
            path,
            secret=self.secret,
            media_dir=self._media_dir,
            logger=self.logger,
        )

    def augment_media_urls(self, payload: dict[str, Any]) -> None:
        attach_signed_media_urls(payload, sign_path=self.sign_media_path)

    def augment_transcript_media(self, paths: list[str]) -> list[dict[str, Any]]:
        return signed_media_attachments(
            paths,
            sign_path=self.sign_or_stage_media_path,
        )

    def augment_transcript_user_media(self, paths: list[str]) -> list[dict[str, Any]]:
        return self.augment_transcript_media(paths)
