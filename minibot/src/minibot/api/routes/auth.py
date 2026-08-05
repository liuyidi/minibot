"""Auth / bootstrap routes."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from minibot.api.deps import StateDep

router = APIRouter(tags=["auth"])


class BootstrapResponse(BaseModel):
    token: str
    ws_path: str = "/ws"
    expires_in: int
    model_name: str
    runtime_surface: str = "minibot"


@router.get("/auth/bootstrap")
@router.get("/webui/bootstrap")
async def bootstrap(
    state: StateDep,
    x_minibot_auth: str | None = Header(default=None, alias="X-Minibot-Auth"),
) -> BootstrapResponse:
    secret = state.settings.auth_secret.strip()
    supplied = x_minibot_auth
    if secret and (not supplied or supplied != secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    token = state.issue_token()
    return BootstrapResponse(
        token=token,
        expires_in=state.settings.token_ttl_s,
        model_name=state.config.model,
    )
