"""Cloud endpoints: desktop platform inference proxy (``/platform/v1``)."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse, StreamingResponse

from minibot.api.deps import StateDep, _extract_bearer
from minibot.api.routes.auth import account_from_mini_auth_userinfo
from minibot.config.platform_models import PLATFORM_MODELS, resolve_platform_runtime
from minibot.platform_proxy.budget import BudgetExceeded
from minibot.platform_proxy.upstream import resolve_upstream_runtime, usage_from_openai_body

log = logging.getLogger("minibot.platform_proxy")

router = APIRouter(prefix="/platform/v1", tags=["platform-proxy"])


def _platform_claims(state: StateDep, authorization: str | None):
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    claims = state.platform_token_store().validate(token)
    if claims is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return claims


async def fetch_mini_auth_userinfo(state: StateDep, access_token: str) -> dict[str, Any]:
    """Verify a mini-auth access token via userinfo (cloud token exchange)."""
    base = state.settings.mini_auth_base_url.rstrip("/")
    url = f"{base}/oauth/userinfo"
    try:
        async with httpx.AsyncClient(
            timeout=state.settings.mini_auth_timeout_s,
            trust_env=False,
        ) as client:
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid mini-auth token",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"mini-auth userinfo failed: {exc}",
        ) from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="invalid userinfo")
    return data


@router.post("/token")
async def mint_platform_token(
    state: StateDep,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    mini_token = _extract_bearer(authorization)
    if not mini_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    userinfo = await fetch_mini_auth_userinfo(state, mini_token)
    account = account_from_mini_auth_userinfo(userinfo)
    user_id = str(account.get("id") or "").strip()
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="mini-auth user missing sub",
        )
    ttl = int(state.settings.platform_proxy_token_ttl_s or 3600)
    token, expires_in = state.platform_token_store().mint(user_id=user_id, ttl_s=ttl)
    log.info("platform token minted user_id=%s ttl=%s", user_id, expires_in)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
    }


@router.get("/models")
async def list_platform_models(
    state: StateDep,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _platform_claims(state, authorization)
    data = []
    for item in PLATFORM_MODELS:
        runtime = resolve_platform_runtime(item.id)
        if runtime is None or not runtime.available:
            continue
        data.append(
            {
                "id": runtime.model,
                "object": "model",
                "owned_by": runtime.brand,
                "platform_id": runtime.id,
            }
        )
    return {"object": "list", "data": data}


@router.get("/budget")
async def desktop_budget_snapshot(
    state: StateDep,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    claims = _platform_claims(state, authorization)
    return state.desktop_budget().snapshot(claims.user_id)


@router.post("/chat/completions")
async def chat_completions(
    request: Request,
    state: StateDep,
    authorization: str | None = Header(default=None),
) -> Any:
    claims = _platform_claims(state, authorization)
    try:
        body = await request.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid JSON") from exc
    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid body")

    model = str(body.get("model") or "").strip()
    runtime = resolve_upstream_runtime(model)
    if runtime is None or not runtime.available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="platform model temporarily unavailable",
        )

    try:
        state.desktop_budget().check(claims.user_id)
    except BudgetExceeded as exc:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"error": {"message": "Desktop quota used up for today", "type": "budget"}},
        )

    stream = bool(body.get("stream"))
    upstream_body = dict(body)
    upstream_body["model"] = runtime.model

    if runtime.backend == "anthropic":
        return await _proxy_anthropic(
            state=state,
            user_id=claims.user_id,
            runtime=runtime,
            body=upstream_body,
            stream=stream,
        )

    return await _proxy_openai_compat(
        state=state,
        user_id=claims.user_id,
        runtime=runtime,
        body=upstream_body,
        stream=stream,
    )


async def _proxy_openai_compat(
    *,
    state: StateDep,
    user_id: str,
    runtime: Any,
    body: dict[str, Any],
    stream: bool,
) -> Any:
    base = (runtime.api_base or "").rstrip("/")
    if not base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="platform model temporarily unavailable",
        )
    url = f"{base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {runtime.api_key}",
        "Content-Type": "application/json",
    }

    if not stream:
        try:
            async with httpx.AsyncClient(timeout=120.0, trust_env=False) as client:
                resp = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as exc:
            log.warning("upstream openai_compat error user=%s slot=%s: %s", user_id, runtime.slot, exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="platform model temporarily unavailable",
            ) from exc
        if resp.status_code >= 400:
            log.warning(
                "upstream openai_compat status=%s user=%s slot=%s",
                resp.status_code,
                user_id,
                runtime.slot,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="platform model temporarily unavailable",
            )
        try:
            data = resp.json()
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="platform model temporarily unavailable",
            ) from exc
        prompt, completion = usage_from_openai_body(data if isinstance(data, dict) else None)
        state.desktop_budget().record(
            user_id, prompt_tokens=prompt, completion_tokens=completion
        )
        return JSONResponse(content=data)

    async def event_stream():
        prompt = 0
        completion = 0
        try:
            async with httpx.AsyncClient(timeout=None, trust_env=False) as client:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        log.warning(
                            "upstream stream status=%s user=%s slot=%s",
                            resp.status_code,
                            user_id,
                            runtime.slot,
                        )
                        yield f"data: {json.dumps({'error': {'message': 'platform model temporarily unavailable'}})}\n\n"
                        return
                    async for line in resp.aiter_lines():
                        if not line:
                            yield "\n"
                            continue
                        yield f"{line}\n"
                        if line.startswith("data:"):
                            payload = line[5:].strip()
                            if payload and payload != "[DONE]":
                                try:
                                    chunk = json.loads(payload)
                                except json.JSONDecodeError:
                                    chunk = None
                                if isinstance(chunk, dict) and isinstance(chunk.get("usage"), dict):
                                    p, c = usage_from_openai_body(chunk)
                                    prompt, completion = p, c
        except httpx.HTTPError as exc:
            log.warning("upstream stream error user=%s slot=%s: %s", user_id, runtime.slot, exc)
            yield f"data: {json.dumps({'error': {'message': 'platform model temporarily unavailable'}})}\n\n"
            return
        finally:
            # Count at least one turn even if upstream omitted usage.
            state.desktop_budget().record(
                user_id, prompt_tokens=prompt, completion_tokens=completion
            )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _proxy_anthropic(
    *,
    state: StateDep,
    user_id: str,
    runtime: Any,
    body: dict[str, Any],
    stream: bool,
) -> Any:
    """Convert OpenAI-shaped chat body → Anthropic Messages (non-stream v1)."""
    del stream  # streaming conversion deferred; always non-stream for anthropic slots
    from minibot.providers.anthropic import AnthropicProvider
    from minibot.providers.base import LLMResponse

    messages = body.get("messages") or []
    if not isinstance(messages, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid messages")

    provider = AnthropicProvider(
        api_key=runtime.api_key,
        base_url=runtime.api_base or "https://api.anthropic.com",
    )
    try:
        result = await provider.chat(
            messages=messages,
            tools=body.get("tools") or [],
            model=runtime.model,
            temperature=float(body.get("temperature") or 0.2),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("upstream anthropic error user=%s slot=%s: %s", user_id, runtime.slot, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="platform model temporarily unavailable",
        ) from exc

    assert isinstance(result, LLMResponse)
    usage = result.usage or {}
    prompt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    completion = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    state.desktop_budget().record(user_id, prompt_tokens=prompt, completion_tokens=completion)

    content: Any = result.content or ""
    message: dict[str, Any] = {"role": "assistant", "content": content}
    finish = "stop"
    if result.tool_calls:
        message["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.name,
                    "arguments": json.dumps(tc.arguments),
                },
            }
            for tc in result.tool_calls
        ]
        finish = "tool_calls"

    return {
        "id": "platform-anthropic",
        "object": "chat.completion",
        "model": runtime.model,
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": finish,
            }
        ],
        "usage": {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": prompt + completion,
        },
    }
