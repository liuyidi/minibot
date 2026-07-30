"""httpx client for minikb read APIs."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from minibot.knowledge.models import Citation, KbSummary, RetrieveHit

logger = logging.getLogger(__name__)

_LIST_CACHE_TTL_S = 60.0


class KbClientError(Exception):
    """Raised when minikb returns an error or is unreachable."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class KbClient:
    """Thin async client for list / retrieve / qa."""

    def __init__(
        self,
        base_url: str,
        api_key: str = "",
        *,
        timeout: float = 30.0,
        connect_timeout: float = 3.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = (api_key or "").strip()
        self.timeout = timeout
        self.connect_timeout = connect_timeout
        self._list_cache: tuple[float, list[KbSummary]] | None = None

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json", "User-Agent": "minibot-kb/0.1"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _timeout(self, read: float | None = None) -> httpx.Timeout:
        return httpx.Timeout(
            connect=self.connect_timeout,
            read=read if read is not None else self.timeout,
            write=self.timeout,
            pool=self.connect_timeout,
        )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        read_timeout: float | None = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout(read_timeout)) as client:
                res = await client.request(
                    method,
                    url,
                    headers=self._headers(),
                    json=json_body,
                    params=params,
                )
        except httpx.TimeoutException as exc:
            raise KbClientError(
                f"minikb timeout ({self.base_url}). Check https://kb.liuyidi.me/health "
                "or set MINIBOT_SERVER_MINIKB_BASE_URL."
            ) from exc
        except httpx.HTTPError as exc:
            raise KbClientError(
                f"minikb unreachable at {self.base_url}: {exc}. "
                "Open the KB UI to verify the service is up."
            ) from exc

        if res.status_code in (401, 403):
            self.clear_cache()
            raise KbClientError(
                f"minikb auth failed ({res.status_code}). "
                "Fix MINIBOT_SERVER_MINIKB_API_KEY or disable require_api_key on minikb.",
                status_code=res.status_code,
            )
        if res.status_code >= 400:
            detail = res.text[:400]
            try:
                payload = res.json()
                if isinstance(payload, dict) and payload.get("detail") is not None:
                    detail = str(payload["detail"])[:400]
            except Exception:
                pass
            raise KbClientError(
                f"minikb HTTP {res.status_code}: {detail}",
                status_code=res.status_code,
            )
        if res.status_code == 204 or not res.content:
            return None
        return res.json()

    def clear_cache(self) -> None:
        self._list_cache = None

    async def list_kbs(self, *, limit: int = 50) -> list[KbSummary]:
        now = time.monotonic()
        if self._list_cache is not None:
            cached_at, items = self._list_cache
            if now - cached_at < _LIST_CACHE_TTL_S:
                return items

        data = await self._request(
            "GET",
            "/v1/kb",
            params={"limit": limit},
            read_timeout=self.connect_timeout + 2.0,
        )
        raw_items = (data or {}).get("items") or []
        items: list[KbSummary] = []
        for item in raw_items:
            items.append(
                {
                    "id": str(item.get("id", "")),
                    "name": str(item.get("name", "")),
                    "slug": str(item.get("slug", "")),
                    "description": item.get("description"),
                    "kind": str(item.get("kind") or "general"),
                    "stats": item.get("stats") or {},
                    "updated_at": item.get("updated_at"),
                }
            )
        self._list_cache = (now, items)
        return items

    async def retrieve(
        self,
        kb_id: str,
        query: str,
        *,
        top_k: int = 5,
        mode: str = "hybrid",
    ) -> list[RetrieveHit]:
        data = await self._request(
            "POST",
            f"/v1/kb/{kb_id}/retrieve",
            json_body={"query": query, "top_k": top_k, "mode": mode},
        )
        hits: list[RetrieveHit] = []
        for hit in (data or {}).get("hits") or []:
            hits.append(
                {
                    "chunk_id": str(hit.get("chunk_id", "")),
                    "document_id": str(hit.get("document_id", "")),
                    "score": float(hit.get("score") or 0.0),
                    "text": str(hit.get("text") or ""),
                    "doc_title": hit.get("doc_title"),
                    "doc_uri": hit.get("doc_uri"),
                }
            )
        return hits

    async def qa(
        self,
        kb_id: str,
        query: str,
        *,
        top_k: int = 6,
        mode: str = "hybrid",
    ) -> dict[str, Any]:
        data = await self._request(
            "POST",
            f"/v1/kb/{kb_id}/qa",
            json_body={"query": query, "top_k": top_k, "mode": mode, "stream": False},
            read_timeout=max(self.timeout, 60.0),
        )
        citations: list[Citation] = []
        for c in (data or {}).get("citations") or []:
            citations.append(
                {
                    "index": int(c.get("index") or 0),
                    "chunk_id": str(c.get("chunk_id", "")),
                    "document_id": str(c.get("document_id", "")),
                    "doc_title": c.get("doc_title"),
                    "doc_uri": c.get("doc_uri"),
                    "text_snippet": c.get("text_snippet"),
                }
            )
        return {
            "answer": str((data or {}).get("answer") or ""),
            "citations": citations,
            "model": (data or {}).get("model"),
            "retrieval_hits": int((data or {}).get("retrieval_hits") or 0),
            "elapsed_ms": float((data or {}).get("elapsed_ms") or 0.0),
        }


def get_kb_client() -> KbClient | None:
    """Build a client from settings; None if base_url unset."""
    from minibot.config.settings import get_settings

    settings = get_settings()
    base = (settings.minikb_base_url or "").strip()
    if not base:
        return None
    return KbClient(
        base_url=base,
        api_key=settings.minikb_api_key,
        timeout=float(settings.minikb_timeout_s),
    )
