"""FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from minibot.app_state import AppState


def get_state(request: Request) -> AppState:
    return request.app.state.app_state


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def require_token(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    x_nanobot_auth: Annotated[str | None, Header(alias="X-Nanobot-Auth")] = None,
    x_minibot_auth: Annotated[str | None, Header(alias="X-Minibot-Auth")] = None,
) -> str:
    state: AppState = request.app.state.app_state
    token = (
        _extract_bearer(authorization)
        or x_minibot_auth
        or x_nanobot_auth
        or request.query_params.get("token")
    )
    if not state.check_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return token or ""


StateDep = Annotated[AppState, Depends(get_state)]
AuthDep = Annotated[str, Depends(require_token)]
