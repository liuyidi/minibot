"""Signed media HTTP route."""

from __future__ import annotations

from fastapi import APIRouter, Request

from minibot.api.deps import StateDep

router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("/{sig}/{payload}")
async def fetch_signed_media(
    sig: str,
    payload: str,
    request: Request,
    state: StateDep,
):
    gateway = state.media_gateway
    if gateway is None:
        from fastapi.responses import PlainTextResponse

        return PlainTextResponse("media gateway unavailable", status_code=503)
    return gateway.serve_signed_media(sig, payload, request=request)
