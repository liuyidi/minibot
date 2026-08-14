"""Feishu channel HTTP API — QR setup (L1) + pairing (L2)."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from minibot.api.deps import AuthDep, StateDep
from minibot.channels.feishu_setup import FeishuPersistedConfig, FeishuSetupManager
from minibot.config.app_config import feishu_public_payload

router = APIRouter(prefix="/api/channels/feishu", tags=["channels-feishu"])


def _setup_mgr(state: Any) -> FeishuSetupManager:
    runtime = state.runtime_for()
    mgr = getattr(runtime, "feishu_setup", None)
    if mgr is None:
        mgr = FeishuSetupManager()
        runtime.feishu_setup = mgr
    return mgr


def _pairing(state: Any) -> Any:
    runtime = state.runtime_for()
    store = getattr(runtime, "feishu_pairing", None)
    if store is None:
        from minibot.channels.pairing import PairingStore

        store = PairingStore(runtime.root)
        runtime.feishu_pairing = store
    return store


class SetupStartBody(BaseModel):
    domain: Literal["feishu", "lark"] = "feishu"
    bot_name: str = "minibot"
    create_only: bool = True


class SetupSaveBody(BaseModel):
    setup_id: str | None = None
    app_id: str | None = None
    app_secret: str | None = None
    bot_name: str = ""
    domain: Literal["feishu", "lark"] = "feishu"
    enabled: bool = True
    dm_policy: Literal["pairing", "allowlist", "open"] = "pairing"
    allow_from: list[str] = Field(default_factory=list)
    scanner_open_id: str = ""


@router.get("")
async def feishu_status(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    payload = feishu_public_payload(state.config.feishu)
    mgr = getattr(state, "channels", None)
    ch = None if mgr is None else mgr.channels.get("feishu")
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
    try:
        session = _setup_mgr(state).start(
            domain=body.domain,
            bot_name=body.bot_name or state.config.bot_name or "minibot",
            create_only=body.create_only,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    # Return immediately; client polls for qr_url so the modal can open without waiting.
    return session.public()


@router.get("/setup/{setup_id}")
async def setup_status(_auth: AuthDep, state: StateDep, setup_id: str) -> dict[str, Any]:
    session = _setup_mgr(state).get(setup_id)
    if session is None:
        raise HTTPException(status_code=404, detail="setup session not found")
    return session.public(include_secret=session.status == "success")


@router.post("/setup/{setup_id}/refresh")
async def setup_refresh(
    _auth: AuthDep,
    state: StateDep,
    setup_id: str,
    body: SetupStartBody | None = None,
) -> dict[str, Any]:
    body = body or SetupStartBody()
    try:
        session = _setup_mgr(state).refresh(
            setup_id,
            domain=body.domain,
            bot_name=body.bot_name or state.config.bot_name or "minibot",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return session.public()


@router.post("/setup/{setup_id}/cancel")
async def setup_cancel(_auth: AuthDep, state: StateDep, setup_id: str) -> dict[str, Any]:
    session = _setup_mgr(state).cancel(setup_id)
    if session is None:
        raise HTTPException(status_code=404, detail="setup session not found")
    return session.public()


@router.post("/setup/save")
async def setup_save(_auth: AuthDep, state: StateDep, body: SetupSaveBody) -> dict[str, Any]:
    app_id = (body.app_id or "").strip()
    app_secret = (body.app_secret or "").strip()
    bot_name = (body.bot_name or "").strip()
    scanner = (body.scanner_open_id or "").strip()
    allow_from = list(body.allow_from)

    if body.setup_id:
        session = _setup_mgr(state).get(body.setup_id)
        if session is None:
            raise HTTPException(status_code=404, detail="setup session not found")
        if session.status != "success":
            raise HTTPException(status_code=409, detail=f"setup status is {session.status}")
        app_id = app_id or session.app_id
        app_secret = app_secret or session.app_secret
        bot_name = bot_name or session.bot_name
        scanner = scanner or session.scanner_open_id

    if not app_id or not app_secret:
        raise HTTPException(status_code=400, detail="app_id and app_secret required")

    if scanner and scanner not in allow_from:
        allow_from.insert(0, scanner)

    if scanner:
        _pairing(state).approve_sender(scanner)

    state.config.feishu = FeishuPersistedConfig(
        enabled=body.enabled,
        app_id=app_id,
        app_secret=app_secret,
        bot_name=bot_name or "minibot",
        domain=body.domain,
        dm_policy=body.dm_policy,
        allow_from=allow_from,
        group_policy=state.config.feishu.group_policy,
    )
    state.save_config(rebuild_provider=False)

    from minibot.channels.factory import reload_feishu_channel

    await reload_feishu_channel(state)
    return feishu_public_payload(state.config.feishu)


@router.post("/enable")
async def feishu_enable(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    if not state.config.feishu.app_id or not state.config.feishu.app_secret:
        raise HTTPException(status_code=400, detail="feishu is not configured")
    state.config.feishu.enabled = True
    state.save_config(rebuild_provider=False)
    from minibot.channels.factory import reload_feishu_channel

    await reload_feishu_channel(state)
    return feishu_public_payload(state.config.feishu)


@router.post("/disable")
async def feishu_disable(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    state.config.feishu.enabled = False
    state.save_config(rebuild_provider=False)
    from minibot.channels.factory import reload_feishu_channel

    await reload_feishu_channel(state)
    return feishu_public_payload(state.config.feishu)


@router.post("/remove")
async def feishu_remove(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    state.config.feishu = FeishuPersistedConfig()
    state.save_config(rebuild_provider=False)
    from minibot.channels.factory import reload_feishu_channel

    await reload_feishu_channel(state)
    return feishu_public_payload(state.config.feishu)


@router.get("/pairing")
async def pairing_list(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    pending = _pairing(state).list_pending()
    return {
        "pending_count": len(pending),
        "pending": [p.public() for p in pending],
        "allow_from": list(state.config.feishu.allow_from),
    }


@router.post("/pairing/{pairing_id}/allow")
async def pairing_allow(_auth: AuthDep, state: StateDep, pairing_id: str) -> dict[str, Any]:
    item = _pairing(state).allow(pairing_id)
    if item is None:
        raise HTTPException(status_code=404, detail="pairing not found")
    if item.sender_id not in state.config.feishu.allow_from:
        state.config.feishu.allow_from.append(item.sender_id)
        state.save_config(rebuild_provider=False)
        mgr = getattr(state, "channels", None)
        ch = None if mgr is None else mgr.channels.get("feishu")
        if ch is not None and hasattr(ch, "config"):
            ch.config.allow_from = list(state.config.feishu.allow_from)
    return {"ok": True, "item": item.public(), "allow_from": list(state.config.feishu.allow_from)}


@router.post("/pairing/{pairing_id}/ignore")
async def pairing_ignore(_auth: AuthDep, state: StateDep, pairing_id: str) -> dict[str, Any]:
    item = _pairing(state).ignore(pairing_id)
    if item is None:
        raise HTTPException(status_code=404, detail="pairing not found")
    return {"ok": True, "item": item.public()}
