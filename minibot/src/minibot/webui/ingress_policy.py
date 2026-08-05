"""Business limits for inbound WebUI messages and attachments."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

MessageRejection = Literal["text_too_large"]


@dataclass(frozen=True)
class MessageIngressLimits:
    max_text_bytes: int = 64 * 1024


@dataclass(frozen=True)
class AttachmentIngressLimits:
    max_count: int = 4
    max_file_bytes: int = 6 * 1024 * 1024
    max_total_bytes: int = 24 * 1024 * 1024


@dataclass(frozen=True)
class WebUIIngressPolicy:
    message: MessageIngressLimits = field(default_factory=MessageIngressLimits)
    attachments: AttachmentIngressLimits = field(default_factory=AttachmentIngressLimits)
    envelope_reserve_bytes: int = 64 * 1024

    def validate_text(self, content: str) -> MessageRejection | None:
        if len(content.encode("utf-8")) > self.message.max_text_bytes:
            return "text_too_large"
        return None


DEFAULT_WEBUI_INGRESS_POLICY = WebUIIngressPolicy()
