"""Prometheus metrics for minibot HTTP (request latency / count)."""

from __future__ import annotations

import time
from typing import Callable

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse

try:
    from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
except ImportError:  # optional until dependency installed
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"
    Counter = Histogram = generate_latest = None  # type: ignore[misc, assignment]

_HTTP_REQUESTS: Counter | None = None
_HTTP_LATENCY: Histogram | None = None


def _ensure_metrics() -> bool:
    global _HTTP_REQUESTS, _HTTP_LATENCY
    if Counter is None or Histogram is None:
        return False
    if _HTTP_REQUESTS is None:
        _HTTP_REQUESTS = Counter(
            "minibot_http_requests_total",
            "Total HTTP requests",
            ["method", "path", "status"],
        )
        _HTTP_LATENCY = Histogram(
            "minibot_http_request_duration_seconds",
            "HTTP request latency",
            ["method", "path", "status"],
            buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30),
        )
    return True


def _normalize_path(path: str) -> str:
    # Keep cardinality low for common dynamic segments.
    parts = path.split("/")
    out: list[str] = []
    for p in parts:
        if not p:
            out.append(p)
            continue
        if len(p) >= 20 and all(c.isalnum() or c in "-_" for c in p):
            out.append(":id")
        else:
            out.append(p)
    return "/".join(out) or "/"


class PrometheusMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not _ensure_metrics() or _HTTP_REQUESTS is None or _HTTP_LATENCY is None:
            return await call_next(request)
        if request.url.path in {"/metrics", "/health"}:
            return await call_next(request)

        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            elapsed = time.perf_counter() - start
            path = _normalize_path(request.url.path)
            labels = {
                "method": request.method,
                "path": path,
                "status": str(status),
            }
            _HTTP_REQUESTS.labels(**labels).inc()
            _HTTP_LATENCY.labels(**labels).observe(elapsed)


def mount_metrics(app: FastAPI) -> None:
    """Register middleware + GET /metrics (no-op if prometheus_client missing)."""
    if not _ensure_metrics():
        return

    app.add_middleware(PrometheusMiddleware)

    @app.get("/metrics")
    async def metrics() -> Response:
        assert generate_latest is not None
        return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)
