"""FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from minibot.app_state import AppState
from minibot.security.principal_context import Principal, bind_data_dir, bind_principal
from minibot.user_runtime import resolve_user_root

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


def bind_user_runtime_context(state: AppState, user_id: str | None) -> None:
    """Bind principal + data_dir for a known user id (bus worker / cron / channels)."""
    uid = (user_id or "").strip() or "system"
    kind = "system" if uid == "system" else "user"
    bind_principal(Principal(kind=kind, user_id=uid))
    bind_data_dir(resolve_user_root(state.settings, uid))


def bind_token_context(state: AppState, token: str | None) -> None:
    """Bind principal and per-user data root from a validated token account."""
    account = state.token_account(token)
    if account and account.get("id"):
        user_id = str(account.get("id"))
        bind_principal(
            Principal(
                kind="user",
                user_id=user_id,
                email=(account.get("email") or None),
                name=(account.get("name") or None),
                picture=(account.get("picture") or None),
            )
        )
        bind_data_dir(resolve_user_root(state.settings, user_id))
        return
    bind_user_runtime_context(state, "system")


async def require_token(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    x_minibot_auth: Annotated[str | None, Header(alias="X-Minibot-Auth")] = None,
) -> str:
    state: AppState = request.app.state.app_state
    token = _extract_supplied_token(request, authorization, x_minibot_auth)
    if not state.check_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    bind_token_context(state, token)
    return token or ""


StateDep = Annotated[AppState, Depends(get_state)]
AuthDep = Annotated[str, Depends(require_token)]
