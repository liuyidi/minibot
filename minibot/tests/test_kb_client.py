"""Unit tests for minikb KbClient."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from minibot.knowledge.client import KbClient, KbClientError


def _handler(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/v1/kb" and request.method == "GET":
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "name": "Demo KB",
                        "slug": "demo",
                        "description": "d",
                        "kind": "general",
                        "stats": {"documents": 2},
                        "updated_at": "2026-07-27T00:00:00Z",
                    }
                ],
                "total": 1,
            },
        )
    if path.endswith("/retrieve") and request.method == "POST":
        body = json.loads(request.content.decode())
        assert body["query"]
        return httpx.Response(
            200,
            json={
                "hits": [
                    {
                        "chunk_id": "22222222-2222-2222-2222-222222222222",
                        "document_id": "33333333-3333-3333-3333-333333333333",
                        "score": 0.91,
                        "text": "Agents need focused projects.",
                        "meta": {},
                        "doc_title": "notes.md",
                        "doc_uri": "s3://x",
                    }
                ],
                "total": 1,
                "mode": body.get("mode", "hybrid"),
                "elapsed_ms": 12.5,
            },
        )
    if path.endswith("/qa") and request.method == "POST":
        return httpx.Response(
            200,
            json={
                "answer": "Focus on one project.",
                "citations": [
                    {
                        "index": 1,
                        "chunk_id": "22222222-2222-2222-2222-222222222222",
                        "document_id": "33333333-3333-3333-3333-333333333333",
                        "doc_title": "notes.md",
                        "doc_uri": "s3://x",
                        "text_snippet": "Agents need",
                    }
                ],
                "model": "mock",
                "retrieval_hits": 1,
                "elapsed_ms": 40.0,
            },
        )
    if path == "/unauthorized":
        return httpx.Response(401, json={"detail": "nope"})
    return httpx.Response(404, json={"detail": "missing"})


class _Transport(httpx.MockTransport):
    def __init__(self) -> None:
        super().__init__(_handler)


@pytest.fixture(autouse=True)
def _patch_client(monkeypatch: pytest.MonkeyPatch) -> None:
    real_async_client = httpx.AsyncClient

    def factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs = dict(kwargs)
        kwargs["transport"] = _Transport()
        kwargs.setdefault("base_url", "http://minikb.test")
        # Drop real network base; our handler uses absolute path only.
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", factory)


def test_list_kbs_and_cache() -> None:
    async def _run() -> None:
        client = KbClient("http://minikb.test")
        first = await client.list_kbs()
        assert first[0]["name"] == "Demo KB"
        second = await client.list_kbs()
        assert second is first  # cache hit returns same list instance

    asyncio.run(_run())


def test_retrieve_and_qa() -> None:
    async def _run() -> None:
        client = KbClient("http://minikb.test")
        hits = await client.retrieve("kb-1", "agents", top_k=3, mode="hybrid")
        assert hits[0]["doc_title"] == "notes.md"
        qa = await client.qa("kb-1", "how to learn?")
        assert "Focus" in qa["answer"]
        assert qa["citations"][0]["doc_title"] == "notes.md"

    asyncio.run(_run())


def test_auth_error() -> None:
    async def _run() -> None:
        client = KbClient("http://minikb.test")
        with pytest.raises(KbClientError) as ei:
            await client._request("GET", "/unauthorized")
        assert ei.value.status_code == 401

    asyncio.run(_run())
