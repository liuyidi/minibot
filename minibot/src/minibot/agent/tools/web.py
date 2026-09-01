"""Web tools: web_fetch (SSRF-guarded) + web_search (DuckDuckGo HTML fallback)."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import quote_plus

import httpx

from minibot.agent.tools.base import Tool
from minibot.providers.http_client import outbound_httpx_trust_env
from minibot.security.network import NetworkDeniedError, require_safe_url, validate_url_target

_TAG_RE = re.compile(r"<[^>]+>")


class WebFetchTool(Tool):
    name = "web_fetch"
    description = "Fetch a public http(s) URL and return text content (SSRF-protected)."
    risk = "medium"
    source = "builtin"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "max_chars": {"type": "integer", "minimum": 100},
            },
            "required": ["url"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        url = str(kwargs.get("url", "")).strip()
        max_chars = int(kwargs.get("max_chars") or 12_000)
        require_safe_url(url)
        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                timeout=20.0,
                trust_env=outbound_httpx_trust_env(),
            ) as client:
                res = await client.get(url, headers={"User-Agent": "minibot/0.1"})
                # Re-validate final URL after redirects
                final = str(res.url)
                ok, err = validate_url_target(final)
                if not ok:
                    raise NetworkDeniedError(f"Redirect blocked: {err}")
                text = res.text
        except NetworkDeniedError:
            raise
        except Exception as exc:
            return f"Error: fetch failed: {exc}"
        if len(text) > max_chars:
            text = text[:max_chars] + "\n…(truncated)"
        return f"status={res.status_code} url={final}\n\n{text}"


class WebSearchTool(Tool):
    name = "web_search"
    description = "Search the web (DuckDuckGo HTML). Optional; may be rate-limited."
    risk = "medium"
    source = "builtin"

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "count": {"type": "integer", "minimum": 1, "maximum": 10},
            },
            "required": ["query"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        query = str(kwargs.get("query", "")).strip()
        count = min(int(kwargs.get("count") or 5), 10)
        if not query:
            return "Error: empty query"
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        require_safe_url(url)
        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                timeout=20.0,
                trust_env=outbound_httpx_trust_env(),
            ) as client:
                res = await client.get(url, headers={"User-Agent": "minibot/0.1"})
                html = res.text
        except Exception as exc:
            return f"Error: search failed: {exc}"

        # Lightweight parse of result links/titles
        results: list[dict[str, str]] = []
        for match in re.finditer(
            r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
            html,
            flags=re.I | re.S,
        ):
            href, title_html = match.group(1), match.group(2)
            title = _TAG_RE.sub("", title_html).strip()
            if href.startswith("//"):
                href = "https:" + href
            results.append({"title": title, "url": href})
            if len(results) >= count:
                break
        if not results:
            return "No results (or DDG blocked the scrape)."
        return json.dumps({"query": query, "results": results}, ensure_ascii=False, indent=2)
