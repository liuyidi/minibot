"""WeChat (weixin) channel HTTP API — QR setup (L1) + pairing (L2)."""

from __future__ import annotations

import asyncio
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from minibot.api.deps import AuthDep, StateDep
from minibot.channels.weixin_setup import WeixinPersistedConfig, WeixinSetupManager
from minibot.config.app_config import weixin_public_payload

router = APIRouter(prefix="/api/channels/weixin", tags=["channels-weixin"])


def _setup_mgr(state: Any) -> WeixinSetupManager:
    mgr = getattr(state, "weixin_setup", None)
    if mgr is None:
        mgr = WeixinSetupManager()
        state.weixin_setup = mgr
    return mgr


def _pairing(state: Any) -> Any:
    store = getattr(state, "weixin_pairing", None)
    if store is None:
        from minibot.channels.pairing import PairingStore

        store = PairingStore(state.settings.data_dir, channel="weixin")
        state.weixin_pairing = store
    return store


class SetupStartBody(BaseModel):
    bot_name: str = "minibot"
    base_url: str = ""


class SetupSaveBody(BaseModel):
    setup_id: str | None = None
    token: str | None = None
    bot_name: str = ""
    base_url: str = ""
    enabled: bool = True
    dm_policy: Literal["pairing", "allowlist", "open"] = "pairing"
    allow_from: list[str] = Field(default_factory=list)
    scanner_user_id: str = ""
    poll_timeout: int = 35


@router.get("")
async def weixin_status(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    payload = weixin_public_payload(state.config.weixin)
    mgr = getattr(state, "channels", None)
    ch = None if mgr is None else mgr.channels.get("weixin")
    payload["running"] = bool(ch and ch.is_running)
    payload["pending_pairing"] = len(_pairing(state).list_pending())
    if mgr is not None and mgr.last_error:
        payload["last_error"] = mgr.last_error
    return payload


@router.post("/setup/start")
async def setup_start(
    _auth: AuthDep,
    state: StateDep,
    body: SetupStartBody | None = None,
) -> dict[str, Any]:
    body = body or SetupStartBody()
    session = _setup_mgr(state).start(
        bot_name=body.bot_name or state.config.bot_name or "minibot",
        base_url=body.base_url or state.config.weixin.base_url,
    )
    for _ in range(40):
        if session.qr_url or session.qr_image_base64 or session.status not in {"starting", "pending"}:
            break
        await asyncio.sleep(0.05)
    return session.public()


@router.get("/setup/{setup_id}")
async def setup_status(_auth: AuthDep, state: StateDep, setup_id: str) -> dict[str, Any]:
    session = _setup_mgr(state).get(setup_id)
    if session is None:
        raise HTTPException(status_code=404, detail="setup session not found")
    return session.public(include_token=session.status == "success")


@router.post("/setup/{setup_id}/refresh")
async def setup_refresh(
    _auth: AuthDep,
    state: StateDep,
    setup_id: str,
    body: SetupStartBody | None = None,
) -> dict[str, Any]:
    body = body or SetupStartBody()
    session = _setup_mgr(state).refresh(
        setup_id,
        bot_name=body.bot_name or state.config.bot_name or "minibot",
        base_url=body.base_url or state.config.weixin.base_url,
    )
    for _ in range(40):
        if session.qr_url or session.qr_image_base64 or session.status not in {"starting", "pending"}:
            break
        await asyncio.sleep(0.05)
    return session.public()


@router.post("/setup/{setup_id}/cancel")
async def setup_cancel(_auth: AuthDep, state: StateDep, setup_id: str) -> dict[str, Any]:
    session = _setup_mgr(state).cancel(setup_id)
    if session is None:
        raise HTTPException(status_code=404, detail="setup session not found")
    return session.public()


@router.post("/setup/save")
async def setup_save(_auth: AuthDep, state: StateDep, body: SetupSaveBody) -> dict[str, Any]:
    token = (body.token or "").strip()
    bot_name = (body.bot_name or "").strip()
    scanner = (body.scanner_user_id or "").strip()
    allow_from = list(body.allow_from)
    base_url = (body.base_url or "").strip()

    if body.setup_id:
        session = _setup_mgr(state).get(body.setup_id)
        if session is None:
            raise HTTPException(status_code=404, detail="setup session not found")
        if session.status != "success":
            raise HTTPException(status_code=409, detail=f"setup status is {session.status}")
        token = token or session.bot_token
        bot_name = bot_name or session.bot_name
        scanner = scanner or session.scanner_user_id
        base_url = base_url or session.base_url

    if not token:
        raise HTTPException(status_code=400, detail="token required")

    if scanner and scanner not in allow_from:
        allow_from.insert(0, scanner)

    if scanner:
        _pairing(state).approve_sender(scanner)

    prev = state.config.weixin
    state.config.weixin = WeixinPersistedConfig(
        enabled=body.enabled,
        token=token,
        bot_name=bot_name or prev.bot_name or "minibot",
        dm_policy=body.dm_policy,
        allow_from=allow_from,
        base_url=base_url or prev.base_url,
        poll_timeout=body.poll_timeout or prev.poll_timeout,
    )
    state.save_config(rebuild_provider=False)

    from minibot.channels.factory import reload_weixin_channel

    await reload_weixin_channel(state)
    return weixin_public_payload(state.config.weixin)


@router.post("/enable")
async def weixin_enable(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    if not state.config.weixin.token.strip():
        raise HTTPException(status_code=400, detail="weixin is not configured")
    state.config.weixin.enabled = True
    state.save_config(rebuild_provider=False)
    from minibot.channels.factory import reload_weixin_channel

    await reload_weixin_channel(state)
    return weixin_public_payload(state.config.weixin)


@router.post("/disable")
async def weixin_disable(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    state.config.weixin.enabled = False
    state.save_config(rebuild_provider=False)
    from minibot.channels.factory import reload_weixin_channel

    await reload_weixin_channel(state)
    return weixin_public_payload(state.config.weixin)


@router.post("/remove")
async def weixin_remove(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    state.config.weixin = WeixinPersistedConfig()
    state.save_config(rebuild_provider=False)
    from minibot.channels.factory import reload_weixin_channel

    await reload_weixin_channel(state)
    return weixin_public_payload(state.config.weixin)


@router.get("/pairing")
async def pairing_list(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    pending = _pairing(state).list_pending()
    return {
        "pending_count": len(pending),
        "pending": [p.public() for p in pending],
        "allow_from": list(state.config.weixin.allow_from),
    }


@router.post("/pairing/{pairing_id}/allow")
async def pairing_allow(_auth: AuthDep, state: StateDep, pairing_id: str) -> dict[str, Any]:
    item = _pairing(state).allow(pairing_id)
    if item is None:
        raise HTTPException(status_code=404, detail="pairing not found")
    if item.sender_id not in state.config.weixin.allow_from:
        state.config.weixin.allow_from.append(item.sender_id)
        state.save_config(rebuild_provider=False)
        mgr = getattr(state, "channels", None)
        ch = None if mgr is None else mgr.channels.get("weixin")
        if ch is not None and hasattr(ch, "config"):
            ch.config.allow_from = list(state.config.weixin.allow_from)
    return {"ok": True, "item": item.public(), "allow_from": list(state.config.weixin.allow_from)}


@router.post("/pairing/{pairing_id}/ignore")
async def pairing_ignore(_auth: AuthDep, state: StateDep, pairing_id: str) -> dict[str, Any]:
    item = _pairing(state).ignore(pairing_id)
    if item is None:
        raise HTTPException(status_code=404, detail="pairing not found")
    return {"ok": True, "item": item.public()}
