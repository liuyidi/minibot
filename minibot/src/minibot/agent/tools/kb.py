"""Read-only knowledge-base tools backed by minikb."""

from __future__ import annotations

import json
from typing import Any

from minibot.agent.tools.base import Tool
from minibot.knowledge.client import KbClient, KbClientError, get_kb_client


def _client_or_error() -> KbClient | str:
    client = get_kb_client()
    if client is None:
        return (
            "Error: minikb is not configured. "
            "Set MINIBOT_SERVER_MINIKB_BASE_URL (e.g. http://minikb:8080) "
            "and restart minibot. Upload/manage docs at the KB UI."
        )
    return client


def _err(exc: BaseException) -> str:
    if isinstance(exc, KbClientError):
        return f"Error: {exc}"
    return f"Error: {type(exc).__name__}: {exc}"


class KbListTool(Tool):
    name = "kb_list"
    description = (
        "List available knowledge bases from minikb (read-only). "
        "Use before kb_search/kb_answer to discover kb_id. "
        "Do not upload or edit documents here — open the minikb UI for writes."
    )
    risk = "low"
    source = "builtin"
    category = "knowledge"

    def parameters_schema(self) -> dict[str, Any]:
        return {"type": "object", "properties": {}, "additionalProperties": False}

    async def execute(self, **kwargs: Any) -> str:
        client = _client_or_error()
        if isinstance(client, str):
            return client
        try:
            items = await client.list_kbs()
        except Exception as exc:
            return _err(exc)
        slim = [
            {
                "id": i.get("id"),
                "name": i.get("name"),
                "slug": i.get("slug"),
                "description": i.get("description"),
                "kind": i.get("kind"),
                "stats": i.get("stats") or {},
                "updated_at": i.get("updated_at"),
            }
            for i in items
        ]
        return json.dumps({"knowledge_bases": slim, "total": len(slim)}, ensure_ascii=False, indent=2)


class KbSearchTool(Tool):
    name = "kb_search"
    description = (
        "Retrieve relevant chunks from a minikb knowledge base (read-only). "
        "Prefer this for factual lookups; cite doc_title/chunk_id in your answer. "
        "Upload documents via the minikb UI, not this tool."
    )
    risk = "low"
    source = "builtin"
    category = "knowledge"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "kb_id": {"type": "string", "description": "Knowledge base UUID from kb_list"},
                "query": {"type": "string"},
                "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
                "mode": {
                    "type": "string",
                    "enum": ["vector", "keyword", "hybrid"],
                    "description": "Retrieval mode; default hybrid",
                },
            },
            "required": ["kb_id", "query"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        client = _client_or_error()
        if isinstance(client, str):
            return client
        kb_id = str(kwargs.get("kb_id") or "").strip()
        query = str(kwargs.get("query") or "").strip()
        if not kb_id or not query:
            return "Error: kb_id and query are required"
        top_k = min(int(kwargs.get("top_k") or 5), 20)
        mode = str(kwargs.get("mode") or "hybrid")
        if mode not in ("vector", "keyword", "hybrid"):
            mode = "hybrid"
        try:
            hits = await client.retrieve(kb_id, query, top_k=top_k, mode=mode)
        except Exception as exc:
            return _err(exc)
        out = []
        for h in hits:
            text = h.get("text") or ""
            if len(text) > 1200:
                text = text[:1200] + "…"
            out.append(
                {
                    "doc_title": h.get("doc_title"),
                    "chunk_id": h.get("chunk_id"),
                    "document_id": h.get("document_id"),
                    "score": h.get("score"),
                    "text": text,
                    "uri": h.get("doc_uri"),
                }
            )
        return json.dumps(
            {"kb_id": kb_id, "query": query[:200], "mode": mode, "hits": out},
            ensure_ascii=False,
            indent=2,
        )


class KbAnswerTool(Tool):
    name = "kb_answer"
    description = (
        "Ask a question against a minikb knowledge base using its RAG/QA endpoint "
        "(read-only). Returns an answer plus citations — always surface citations "
        "to the user. Prefer kb_search when you only need raw evidence."
    )
    risk = "medium"
    source = "builtin"
    category = "knowledge"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "kb_id": {"type": "string"},
                "query": {"type": "string"},
                "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
            },
            "required": ["kb_id", "query"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        client = _client_or_error()
        if isinstance(client, str):
            return client
        kb_id = str(kwargs.get("kb_id") or "").strip()
        query = str(kwargs.get("query") or "").strip()
        if not kb_id or not query:
            return "Error: kb_id and query are required"
        top_k = min(int(kwargs.get("top_k") or 6), 20)
        try:
            result = await client.qa(kb_id, query, top_k=top_k, mode="hybrid")
        except Exception as exc:
            return _err(exc)
        return json.dumps(
            {
                "kb_id": kb_id,
                "query": query[:200],
                "answer": result.get("answer"),
                "citations": result.get("citations") or [],
                "retrieval_hits": result.get("retrieval_hits"),
                "model": result.get("model"),
                "elapsed_ms": result.get("elapsed_ms"),
            },
            ensure_ascii=False,
            indent=2,
        )
