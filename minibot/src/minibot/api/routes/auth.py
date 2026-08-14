"""Auth / bootstrap routes."""

from __future__ import annotations

import base64
import hashlib
import platform
import subprocess
import time
from pathlib import Path
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from minibot.api.deps import AUTH_COOKIE_NAME, StateDep
from minibot.app_state import MiniAuthLoginRecord
from minibot.webui_static import resolve_webui_dist

router = APIRouter(tags=["auth"])

_DESKTOP_DONE_PATH = "auth/desktop-done.html"
_FALLBACK_DESKTOP_DONE_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><title>登录成功</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0">
  <main style="text-align:center">
    <h1>登录成功</h1>
    <p><a href="minibot://auth/done">打开 Minibot 继续使用</a></p>
  </main>
</body>
</html>
"""


def _desktop_done_file() -> Path | None:
    dist = resolve_webui_dist()
    if dist is None:
        return None
    path = dist / _DESKTOP_DONE_PATH
    return path if path.is_file() else None


def _focus_desktop_app() -> dict[str, object]:
    """Best-effort bring desktop shell to front (macOS). Deep links need a registered .app."""
    system = platform.system()
    if system != "Darwin":
        return {"ok": False, "reason": f"unsupported platform: {system}"}

    # Prefer direct process name (works with `tauri:dev` binary).
    scripts = [
        'tell application "System Events" to set frontmost of process '
        '"minibot-desktop-v2" to true',
        'tell application "System Events" to set frontmost of process '
        '"minibot V2" to true',
        'tell application id "me.liuyidi.minibot.desktopv2" to activate',
    ]
    errors: list[str] = []
    for script in scripts:
        try:
            completed = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            errors.append(str(exc))
            continue
        if completed.returncode == 0:
            return {"ok": True, "focused": True}
        detail = (completed.stderr or completed.stdout or "").strip()
        if detail:
            errors.append(detail)
    return {"ok": False, "reason": "; ".join(errors) or "focus failed"}


class DesktopHandoffResponse(BaseModel):
    token: str
    expires_in: int
    next_url: str = "/"


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
    account: dict[str, str | None] | None = None


class DesktopCompleteRequest(BaseModel):
    code: str = Field(min_length=1)
    state: str = Field(min_length=1)


class DesktopCompleteResponse(BaseModel):
    token: str
    expires_in: int
    next_url: str = "/"


def _token_from_request(
    request: Request,
    x_minibot_auth: str | None,
    minibot_auth_token: str | None,
) -> str | None:
    return x_minibot_auth or minibot_auth_token or request.query_params.get("token")


def _normalized_next_url(next_url: str | None) -> str:
    value = (next_url or "").strip()
    return value or "/"


def _absolute_next_url(request: Request, next_url: str | None) -> str:
    value = _normalized_next_url(next_url)
    if value.startswith(("http://", "https://")):
        return value
    origin = str(request.base_url).rstrip("/")
    return f"{origin}{value if value.startswith('/') else f'/{value}'}"


def _http_callback_url(request: Request, state: StateDep) -> str:
    return f"{str(request.base_url).rstrip('/')}{state.settings.mini_auth_callback_path}"


def _desktop_callback_url(state: StateDep) -> str:
    return (state.settings.mini_auth_desktop_redirect_uri or "minibot://auth/callback").strip()


def account_from_mini_auth_userinfo(userinfo: dict) -> dict[str, str | None]:
    identities = userinfo.get("identities") or []
    github = next(
        (
            item
            for item in identities
            if isinstance(item, dict) and item.get("provider") == "github"
        ),
        None,
    )
    display_name = None
    if isinstance(github, dict):
        raw = github.get("display_name")
        if isinstance(raw, str) and raw.strip():
            display_name = raw.strip()
    return {
        "id": userinfo.get("sub"),
        "email": userinfo.get("email"),
        "name": userinfo.get("preferred_username") or userinfo.get("name") or userinfo.get("email"),
        "picture": userinfo.get("picture"),
        "created_at": userinfo.get("created_at"),
        "github_bound": "true" if github is not None else "false",
        "github_display_name": display_name,
    }


def _code_challenge_s256(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _build_authorize_url(
    request: Request,
    state: StateDep,
    next_url: str | None,
    *,
    desktop: bool = False,
    desktop_login_id: str | None = None,
) -> str:
    # With desktop_login_id, use HTTP loopback so the system browser can finish
    # PKCE; the desktop WebView polls /auth/desktop/handoff (deep links are flaky
    # under `tauri:dev`). Without an id, keep minibot:// for packaged deep-link flow.
    handoff_id = (desktop_login_id or "").strip()
    if desktop and not handoff_id:
        redirect_uri = _desktop_callback_url(state)
    else:
        redirect_uri = _http_callback_url(request, state)
    login_state, code_verifier = state.begin_mini_auth_login(
        _normalized_next_url(next_url),
        redirect_uri=redirect_uri,
        desktop_login_id=handoff_id or None,
    )
    challenge = _code_challenge_s256(code_verifier)
    params = urlencode(
        {
            "response_type": "code",
            "client_id": state.settings.mini_auth_client_id,
            "redirect_uri": redirect_uri,
            "scope": state.settings.mini_auth_scope,
            "state": login_state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    return f"{state.settings.mini_auth_base_url.rstrip('/')}/oauth/authorize?{params}"


async def _exchange_mini_auth_code(
    state: StateDep,
    *,
    code: str,
    login_record: MiniAuthLoginRecord,
    redirect_uri: str,
) -> tuple[dict[str, str | None], int]:
    base_url = state.settings.mini_auth_base_url.rstrip("/")
    token_url = f"{base_url}/oauth/token"
    userinfo_url = f"{base_url}/oauth/userinfo"
    try:
        # trust_env=False: ignore HTTP(S)_PROXY from IDE/agent sandboxes; those
        # proxies often 403 CONNECT to auth.liuyidi.me and break local login.
        async with httpx.AsyncClient(
            timeout=state.settings.mini_auth_timeout_s,
            trust_env=False,
        ) as client:
            token_response = await client.post(
                token_url,
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
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
            userinfo = userinfo_response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"mini-auth rejected the callback: {exc.response.status_code}",
        ) from exc
    except httpx.ProxyError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"mini-auth unreachable via proxy: {exc}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"mini-auth callback failed: {exc}",
        ) from exc

    return account_from_mini_auth_userinfo(userinfo), expires_in


@router.get("/auth/config", response_model=AuthConfigResponse)
async def auth_config(
    request: Request,
    state: StateDep,
    x_minibot_auth: str | None = Header(default=None, alias="X-Minibot-Auth"),
    minibot_auth_token: str | None = Cookie(default=None, alias=AUTH_COOKIE_NAME),
) -> AuthConfigResponse:
    provider = state.settings.normalized_auth_provider()
    supplied = _token_from_request(request, x_minibot_auth, minibot_auth_token)
    authenticated = state.check_token(supplied)
    login_url = "/auth/login" if provider == "mini_auth" else None
    logout_url = "/auth/logout" if provider == "mini_auth" else None
    return AuthConfigResponse(
        auth_provider=provider,
        authenticated=authenticated,
        login_url=login_url,
        logout_url=logout_url,
        account=state.token_account(supplied) if authenticated else None,
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
    # Short-lived API/WS token must inherit the login cookie's account, otherwise
    # every WebUI client collapses onto the shared ``system`` user runtime.
    account = state.token_account(supplied)
    token = state.issue_token(account=dict(account) if account else None)
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
    desktop: bool = Query(default=False),
    desktop_login_id: str | None = Query(default=None),
) -> RedirectResponse:
    if state.settings.normalized_auth_provider() != "mini_auth":
        return RedirectResponse(url=_normalized_next_url(next), status_code=status.HTTP_302_FOUND)
    authorize_url = _build_authorize_url(
        request,
        state,
        next,
        desktop=desktop,
        desktop_login_id=desktop_login_id,
    )
    return RedirectResponse(url=authorize_url, status_code=status.HTTP_302_FOUND)


@router.get("/auth/mini-auth/callback", response_model=None)
async def mini_auth_callback(
    request: Request,
    state: StateDep,
    code: str = Query(...),
    oauth_state: str = Query(..., alias="state"),
):
    if state.settings.normalized_auth_provider() != "mini_auth":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mini-auth is disabled")

    login_record = state.consume_mini_auth_login(oauth_state)
    if login_record is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired login state")

    redirect_uri = login_record.redirect_uri or _http_callback_url(request, state)
    account, expires_in = await _exchange_mini_auth_code(
        state,
        code=code,
        login_record=login_record,
        redirect_uri=redirect_uri,
    )
    session_token = state.issue_token(ttl_s=expires_in, account=account)
    if login_record.desktop_login_id:
        state.put_desktop_handoff(
            login_record.desktop_login_id,
            token=session_token,
            ttl_s=expires_in,
            next_url=login_record.next_url or "/",
        )
        return RedirectResponse(url="/auth/desktop/done", status_code=status.HTTP_302_FOUND)
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


@router.get("/auth/desktop/done", response_model=None)
async def desktop_done():
    """Browser landing page after desktop OAuth; static HTML lives in webui dist."""
    path = _desktop_done_file()
    if path is not None:
        return FileResponse(path, media_type="text/html; charset=utf-8")
    return HTMLResponse(content=_FALLBACK_DESKTOP_DONE_HTML, status_code=status.HTTP_200_OK)


@router.post("/auth/desktop/focus")
@router.get("/auth/desktop/focus")
async def desktop_focus() -> dict[str, object]:
    """Focus a running desktop shell. Used when ``minibot://`` is not registered yet."""
    return _focus_desktop_app()


@router.get("/auth/desktop/handoff", response_model=DesktopHandoffResponse)
async def desktop_handoff(
    state: StateDep,
    id: str = Query(..., min_length=1),
) -> DesktopHandoffResponse:
    """Poll after system-browser login; returns once the OAuth callback stored a token."""
    record = state.take_desktop_handoff(id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Handoff not ready")
    remaining = max(1, int(record.expires_at - time.time()))
    return DesktopHandoffResponse(
        token=record.token,
        expires_in=remaining,
        next_url=record.next_url or "/",
    )


@router.post("/auth/desktop/complete", response_model=DesktopCompleteResponse)
async def desktop_complete(
    state: StateDep,
    body: DesktopCompleteRequest,
) -> DesktopCompleteResponse:
    """Finish PKCE after ``minibot://auth/callback`` lands in the desktop shell."""
    if state.settings.normalized_auth_provider() != "mini_auth":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mini-auth is disabled")

    login_record = state.consume_mini_auth_login(body.state)
    if login_record is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired login state")

    redirect_uri = login_record.redirect_uri or _desktop_callback_url(state)
    account, expires_in = await _exchange_mini_auth_code(
        state,
        code=body.code,
        login_record=login_record,
        redirect_uri=redirect_uri,
    )
    session_token = state.issue_token(ttl_s=expires_in, account=account)
    return DesktopCompleteResponse(
        token=session_token,
        expires_in=expires_in,
        next_url=login_record.next_url or "/",
    )


@router.get("/auth/desktop/session")
async def desktop_session(
    state: StateDep,
    token: str = Query(...),
    next: str | None = Query(default="/"),
) -> RedirectResponse:
    """Install the auth cookie into the desktop WebView (same-origin as gateway)."""
    if not state.check_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    account = state.token_account(token)
    # Re-issue so the cookie carries a fresh TTL window while keeping account.
    expires_in = state.settings.token_ttl_s
    session_token = state.issue_token(ttl_s=expires_in, account=dict(account) if account else None)
    state.revoke_token(token)
    response = RedirectResponse(url=_normalized_next_url(next), status_code=status.HTTP_302_FOUND)
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
    if state.settings.normalized_auth_provider() == "mini_auth":
        next_target = _absolute_next_url(request, next)
        mini_auth_logout = (
            f"{state.settings.mini_auth_base_url.rstrip('/')}/logout?next={quote(next_target, safe='')}"
        )
        response = RedirectResponse(url=mini_auth_logout, status_code=status.HTTP_302_FOUND)
    else:
        response = RedirectResponse(url=_normalized_next_url(next), status_code=status.HTTP_302_FOUND)
    response.delete_cookie(AUTH_COOKIE_NAME, path="/")
    return response
