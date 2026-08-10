"""Auth / bootstrap routes."""

from __future__ import annotations

import base64
import hashlib
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from minibot.api.deps import AUTH_COOKIE_NAME, StateDep

router = APIRouter(tags=["auth"])


class BootstrapResponse(BaseModel):
    token: str
    ws_path: str = "/ws"
    expires_in: int
    model_name: str
    runtime_surface: str = "minibot"


class AuthConfigResponse(BaseModel):
    auth_provider: str = "local"
    authenticated: bool = False
    login_url: str | None = None
    logout_url: str | None = None


def _token_from_request(
    request: Request,
    x_minibot_auth: str | None,
    minibot_auth_token: str | None,
) -> str | None:
    return x_minibot_auth or minibot_auth_token or request.query_params.get("token")


def _normalized_next_url(next_url: str | None) -> str:
    value = (next_url or "").strip()
    return value or "/"


def _callback_url(request: Request, state: StateDep) -> str:
    return f"{str(request.base_url).rstrip('/')}{state.settings.mini_auth_callback_path}"


def _code_challenge_s256(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _build_authorize_url(request: Request, state: StateDep, next_url: str | None) -> str:
    login_state, code_verifier = state.begin_mini_auth_login(_normalized_next_url(next_url))
    challenge = _code_challenge_s256(code_verifier)
    params = urlencode(
        {
            "response_type": "code",
            "client_id": state.settings.mini_auth_client_id,
            "redirect_uri": _callback_url(request, state),
            "scope": state.settings.mini_auth_scope,
            "state": login_state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    return f"{state.settings.mini_auth_base_url.rstrip('/')}/oauth/authorize?{params}"


@router.get("/auth/config", response_model=AuthConfigResponse)
async def auth_config(
    request: Request,
    state: StateDep,
    x_minibot_auth: str | None = Header(default=None, alias="X-Minibot-Auth"),
    minibot_auth_token: str | None = Cookie(default=None, alias=AUTH_COOKIE_NAME),
) -> AuthConfigResponse:
    provider = state.settings.normalized_auth_provider()
    authenticated = state.check_token(_token_from_request(request, x_minibot_auth, minibot_auth_token))
    login_url = "/auth/login" if provider == "mini_auth" else None
    logout_url = "/auth/logout" if provider == "mini_auth" else None
    return AuthConfigResponse(
        auth_provider=provider,
        authenticated=authenticated,
        login_url=login_url,
        logout_url=logout_url,
    )


@router.get("/auth/bootstrap")
@router.get("/webui/bootstrap")
async def bootstrap(
    request: Request,
    state: StateDep,
    x_minibot_auth: str | None = Header(default=None, alias="X-Minibot-Auth"),
    minibot_auth_token: str | None = Cookie(default=None, alias=AUTH_COOKIE_NAME),
) -> BootstrapResponse:
    supplied = _token_from_request(request, x_minibot_auth, minibot_auth_token)
    if not state.check_token(supplied):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    token = state.issue_token()
    return BootstrapResponse(
        token=token,
        expires_in=state.settings.token_ttl_s,
        model_name=state.config.model,
    )


@router.get("/auth/login")
async def login(
    request: Request,
    state: StateDep,
    next: str | None = Query(default="/"),
) -> RedirectResponse:
    if state.settings.normalized_auth_provider() != "mini_auth":
        return RedirectResponse(url=_normalized_next_url(next), status_code=status.HTTP_302_FOUND)
    authorize_url = _build_authorize_url(request, state, next)
    return RedirectResponse(url=authorize_url, status_code=status.HTTP_302_FOUND)


@router.get("/auth/mini-auth/callback")
async def mini_auth_callback(
    request: Request,
    state: StateDep,
    code: str = Query(...),
    oauth_state: str = Query(..., alias="state"),
) -> RedirectResponse:
    if state.settings.normalized_auth_provider() != "mini_auth":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mini-auth is disabled")

    login_record = state.consume_mini_auth_login(oauth_state)
    if login_record is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired login state")

    callback_url = _callback_url(request, state)
    base_url = state.settings.mini_auth_base_url.rstrip("/")
    token_url = f"{base_url}/oauth/token"
    userinfo_url = f"{base_url}/oauth/userinfo"
    try:
        async with httpx.AsyncClient(timeout=state.settings.mini_auth_timeout_s) as client:
            token_response = await client.post(
                token_url,
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": callback_url,
                    "client_id": state.settings.mini_auth_client_id,
                    "code_verifier": login_record.code_verifier,
                },
            )
            token_response.raise_for_status()
            token_data = token_response.json()
            access_token = token_data.get("access_token")
            expires_in = int(token_data.get("expires_in") or state.settings.token_ttl_s)
            if not access_token:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="mini-auth token response missing access_token",
                )

            userinfo_response = await client.get(
                userinfo_url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo_response.raise_for_status()
            _ = userinfo_response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"mini-auth rejected the callback: {exc.response.status_code}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"mini-auth callback failed: {exc}",
        ) from exc

    session_token = state.issue_token(ttl_s=expires_in)
    response = RedirectResponse(url=login_record.next_url or "/", status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        AUTH_COOKIE_NAME,
        session_token,
        max_age=expires_in,
        path="/",
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/auth/logout")
async def logout(
    request: Request,
    state: StateDep,
    next: str | None = Query(default="/"),
    x_minibot_auth: str | None = Header(default=None, alias="X-Minibot-Auth"),
    minibot_auth_token: str | None = Cookie(default=None, alias=AUTH_COOKIE_NAME),
) -> RedirectResponse:
    supplied = _token_from_request(request, x_minibot_auth, minibot_auth_token)
    state.revoke_token(supplied)
    response = RedirectResponse(url=_normalized_next_url(next), status_code=status.HTTP_302_FOUND)
    response.delete_cookie(AUTH_COOKIE_NAME, path="/")
    return response
