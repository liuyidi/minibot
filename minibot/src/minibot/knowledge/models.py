"""Lightweight shapes for minikb API responses (demo MVP)."""

from __future__ import annotations

from typing import Any, TypedDict


class KbSummary(TypedDict, total=False):
    id: str
    name: str
    slug: str
    description: str | None
    kind: str
    stats: dict[str, Any]
    updated_at: str | None


class RetrieveHit(TypedDict, total=False):
    chunk_id: str
    document_id: str
    score: float
    text: str
    doc_title: str | None
    doc_uri: str | None


class Citation(TypedDict, total=False):
    index: int
    chunk_id: str
    document_id: str
    doc_title: str | None
    doc_uri: str | None
    text_snippet: str | None
