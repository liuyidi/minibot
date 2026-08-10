"""FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from minibot.app_state import AppState

AUTH_COOKIE_NAME = "minibot_auth_token"


def get_state(request: Request) -> AppState:
    return request.app.state.app_state


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def _extract_supplied_token(
    request: Request,
    authorization: str | None,
    x_minibot_auth: str | None,
) -> str | None:
    return (
        _extract_bearer(authorization)
        or x_minibot_auth
        or request.cookies.get(AUTH_COOKIE_NAME)
        or request.query_params.get("token")
    )


async def require_token(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    x_minibot_auth: Annotated[str | None, Header(alias="X-Minibot-Auth")] = None,
) -> str:
    state: AppState = request.app.state.app_state
    token = _extract_supplied_token(request, authorization, x_minibot_auth)
    if not state.check_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return token or ""


StateDep = Annotated[AppState, Depends(get_state)]
AuthDep = Annotated[str, Depends(require_token)]
