"""Tests for kb_* agent tools."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from minibot.agent.tools.builtin import register_default_tools
from minibot.agent.tools.kb import KbAnswerTool, KbListTool, KbSearchTool
from minibot.config.settings import get_settings
from minibot.knowledge.client import KbClient


class _FakeClient(KbClient):
    def __init__(self) -> None:
        super().__init__("http://fake")

    async def list_kbs(self, *, limit: int = 50) -> list[dict[str, Any]]:
        return [
            {
                "id": "kb-1",
                "name": "Demo",
                "slug": "demo",
                "description": None,
                "kind": "general",
                "stats": {"documents": 1},
                "updated_at": None,
            }
        ]

    async def retrieve(
        self,
        kb_id: str,
        query: str,
        *,
        top_k: int = 5,
        mode: str = "hybrid",
    ) -> list[dict[str, Any]]:
        return [
            {
                "chunk_id": "c1",
                "document_id": "d1",
                "score": 0.8,
                "text": f"hit for {query}",
                "doc_title": "doc.md",
                "doc_uri": None,
            }
        ]

    async def qa(
        self,
        kb_id: str,
        query: str,
        *,
        top_k: int = 6,
        mode: str = "hybrid",
    ) -> dict[str, Any]:
        return {
            "answer": f"ans:{query}",
            "citations": [{"index": 1, "chunk_id": "c1", "document_id": "d1", "doc_title": "doc.md"}],
            "model": "m",
            "retrieval_hits": 1,
            "elapsed_ms": 1.0,
        }


def test_tools_require_config(monkeypatch: pytest.MonkeyPatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("MINIBOT_SERVER_MINIKB_BASE_URL", "")
    get_settings.cache_clear()

    async def _run() -> None:
        out = await KbListTool().execute()
        assert "not configured" in out

    asyncio.run(_run())
    get_settings.cache_clear()


def test_tools_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeClient()
    monkeypatch.setattr("minibot.agent.tools.kb.get_kb_client", lambda: fake)

    async def _run() -> None:
        listed = json.loads(await KbListTool().execute())
        assert listed["total"] == 1
        searched = json.loads(await KbSearchTool().execute(kb_id="kb-1", query="agents"))
        assert searched["hits"][0]["doc_title"] == "doc.md"
        answered = json.loads(await KbAnswerTool().execute(kb_id="kb-1", query="q"))
        assert answered["answer"].startswith("ans:")

    asyncio.run(_run())


def test_register_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("MINIBOT_SERVER_MINIKB_BASE_URL", "http://minikb:8080")
    get_settings.cache_clear()
    tools = register_default_tools()
    names = tools.names()
    assert "kb_list" in names
    assert "kb_search" in names
    assert "kb_answer" in names
    get_settings.cache_clear()
    monkeypatch.delenv("MINIBOT_SERVER_MINIKB_BASE_URL", raising=False)
    get_settings.cache_clear()
    tools2 = register_default_tools()
    assert "kb_list" not in tools2.names()
    get_settings.cache_clear()
