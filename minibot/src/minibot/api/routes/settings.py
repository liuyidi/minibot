"""Settings REST routes (JSON body)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from minibot.api.deps import AuthDep, StateDep
from minibot.config.app_config import SettingsUpdate, apply_settings_update, settings_public_payload
from minibot.config.presets import (
    PresetError,
    activate_preset,
    delete_preset,
    upsert_preset,
)
from minibot.config.mcp_presets import (
    McpPreset,
    McpPresetError,
    apply_template_api_key,
    delete_mcp_preset,
    find_preset,
    list_mcp_templates,
    presets_public_list as mcp_presets_public_list,
    set_mcp_enabled,
    upsert_mcp_preset,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdateBody(BaseModel):
    model: str | None = None
    provider: str | None = None
    openai_api_key: str | None = Field(default=None, alias="api_key")
    openai_base_url: str | None = Field(default=None, alias="api_base")
    temperature: float | None = None
    max_iterations: int | None = None
    bot_name: str | None = None
    timezone: str | None = None
    active_preset: str | None = None
    mobile_entry_enabled: bool | None = None
    mobile_entry_ios_url: str | None = None
    mobile_entry_android_url: str | None = None
    mobile_entry_fallback_url: str | None = None
    mobile_entry_delay_ms: int | None = None
    mobile_entry_title: str | None = None
    mobile_entry_description: str | None = None

    model_config = {"populate_by_name": True}


class ModelConfigurationBody(BaseModel):
    id: str | None = None
    label: str | None = None
    model: str | None = None
    provider: str | None = None
    api_key: str | None = None
    api_base: str | None = None
    temperature: float | None = None
    fallback: list[str] | None = None
    activate: bool = False


@router.get("/usage")
async def settings_usage(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    if state.usage_budget is None:
        return {
            "user_id": state.current_user_id(),
            "days": [],
            "totals": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "turns": 0},
            "tripped": False,
            "by_entry": {},
            "limits": {"daily_token_limit": 0, "daily_turn_limit": 0, "enabled": False},
        }
    payload = state.usage_budget.snapshot()
    payload["user_id"] = state.current_user_id()
    return payload


@router.get("/provider-models")
async def provider_models(_auth: AuthDep, provider: str = "openai") -> dict[str, Any]:
    return {"provider": provider, "models": []}


@router.get("/provider/update")
@router.post("/provider/update")
async def provider_update_alias(
    _auth: AuthDep,
    state: StateDep,
    body: SettingsUpdateBody | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    api_base: str | None = None,
) -> dict[str, Any]:
    update = SettingsUpdate(
        provider=(body.provider if body else None) or provider,
        openai_api_key=(body.openai_api_key if body else None) or api_key,
        openai_base_url=(body.openai_base_url if body else None) or api_base,
    )
    state.config = apply_settings_update(state.config, update)
    state.save_config()
    return settings_public_payload(state.config)


@router.get("")
async def get_settings(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    from minibot.observability import langfuse as lf

    payload = settings_public_payload(state.config)
    payload["observability"] = lf.observability_public_payload(state.settings)
    return payload


@router.patch("")
@router.post("/update")
async def update_settings(
    _auth: AuthDep,
    state: StateDep,
    body: SettingsUpdateBody,
) -> dict[str, Any]:
    if body.active_preset:
        try:
            activate_preset(state.config, body.active_preset)
        except PresetError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        # Optional field overlays after activate
        update = SettingsUpdate(
            model=body.model,
            provider=body.provider,
            openai_api_key=body.openai_api_key,
            openai_base_url=body.openai_base_url,
            temperature=body.temperature,
            max_iterations=body.max_iterations,
            bot_name=body.bot_name,
            timezone=body.timezone,
            mobile_entry_enabled=body.mobile_entry_enabled,
            mobile_entry_ios_url=body.mobile_entry_ios_url,
            mobile_entry_android_url=body.mobile_entry_android_url,
            mobile_entry_fallback_url=body.mobile_entry_fallback_url,
            mobile_entry_delay_ms=body.mobile_entry_delay_ms,
            mobile_entry_title=body.mobile_entry_title,
            mobile_entry_description=body.mobile_entry_description,
        )
        if any(v is not None for v in update.model_dump().values()):
            state.config = apply_settings_update(state.config, update)
    else:
        update = SettingsUpdate(
            model=body.model,
            provider=body.provider,
            openai_api_key=body.openai_api_key,
            openai_base_url=body.openai_base_url,
            temperature=body.temperature,
            max_iterations=body.max_iterations,
            bot_name=body.bot_name,
            timezone=body.timezone,
            mobile_entry_enabled=body.mobile_entry_enabled,
            mobile_entry_ios_url=body.mobile_entry_ios_url,
            mobile_entry_android_url=body.mobile_entry_android_url,
            mobile_entry_fallback_url=body.mobile_entry_fallback_url,
            mobile_entry_delay_ms=body.mobile_entry_delay_ms,
            mobile_entry_title=body.mobile_entry_title,
            mobile_entry_description=body.mobile_entry_description,
        )
        state.config = apply_settings_update(state.config, update)
    state.save_config()
    return settings_public_payload(state.config)


@router.get("/network-safety/update")
@router.post("/network-safety/update")
async def update_network_safety(
    _auth: AuthDep,
    state: StateDep,
    webui_allow_local_service_access: str | None = None,
    webui_default_access_mode: str | None = None,
) -> dict[str, Any]:
    from minibot.security.principal_context import current_data_dir
    from minibot.webui.workspace_state import (
        read_webui_workspace_state,
        write_webui_workspace_state,
    )

    data_dir = current_data_dir() or state.settings.data_dir
    state_payload = read_webui_workspace_state(data_dir)
    if webui_default_access_mode is not None:
        mode = webui_default_access_mode.strip().lower()
        if mode == "restricted":
            mode = "default"
        if mode not in {"default", "full"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="webui_default_access_mode must be default or full",
            )
        state_payload["default_access_mode"] = mode
    if webui_allow_local_service_access is not None:
        raw = webui_allow_local_service_access.strip().lower()
        state_payload["webui_allow_local_service_access"] = raw in {"1", "true", "yes", "on"}
    write_webui_workspace_state(data_dir, state_payload)
    return settings_public_payload(state.config)


@router.get("/model-configurations/create")
@router.post("/model-configurations/create")
@router.post("/model-configurations")
async def create_model_configuration(
    _auth: AuthDep,
    state: StateDep,
    body: ModelConfigurationBody | None = None,
    label: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    payload = body or ModelConfigurationBody(
        label=label,
        provider=provider,
        model=model,
    )
    try:
        upsert_preset(
            state.config,
            preset_id=payload.id,
            label=payload.label,
            model=payload.model,
            provider=payload.provider,
            api_key=payload.api_key,
            api_base=payload.api_base,
            temperature=payload.temperature,
            fallback=payload.fallback,
            activate=payload.activate,
        )
    except PresetError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    state.save_config()
    return settings_public_payload(state.config)


@router.post("/model-configurations/{preset_id}/activate")
async def activate_model_configuration(
    _auth: AuthDep,
    state: StateDep,
    preset_id: str,
) -> dict[str, Any]:
    try:
        activate_preset(state.config, preset_id)
    except PresetError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    state.config.active_platform_model = ""
    state.save_config()
    return settings_public_payload(state.config)


@router.post("/platform-models/{model_id}/activate")
async def activate_platform_model(
    _auth: AuthDep,
    state: StateDep,
    model_id: str,
) -> dict[str, Any]:
    from minibot.config.platform_credentials import (
        ensure_platform_token_sync,
        platform_proxy_mode_enabled,
    )
    from minibot.config.platform_models import apply_platform_model
    from minibot.user_runtime import resolve_user_root

    proxy_base = ""
    proxy_token = ""
    if platform_proxy_mode_enabled(state.settings):
        proxy_base = state.settings.platform_proxy_base_url.strip()
        root = resolve_user_root(state.settings, state.current_user_id())
        try:
            creds = ensure_platform_token_sync(
                root,
                proxy_base_url=proxy_base,
                timeout_s=state.settings.mini_auth_timeout_s,
            )
            proxy_token = creds.access_token
        except Exception:  # noqa: BLE001
            proxy_token = ""
    try:
        apply_platform_model(
            state.config,
            model_id,
            proxy_base_url=proxy_base,
            proxy_token=proxy_token,
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    state.save_config()
    return settings_public_payload(state.config)


@router.delete("/model-configurations/{preset_id}")
async def delete_model_configuration(
    _auth: AuthDep,
    state: StateDep,
    preset_id: str,
) -> dict[str, Any]:
    try:
        delete_preset(state.config, preset_id)
    except PresetError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    state.save_config()
    return settings_public_payload(state.config)


@router.get("/commands")
async def list_commands_alias(_auth: AuthDep) -> dict[str, list]:
    from minibot.api.routes.misc import BUILTIN_SLASH_COMMANDS

    return {"commands": list(BUILTIN_SLASH_COMMANDS)}


class McpPresetBody(BaseModel):
    id: str | None = None
    label: str | None = None
    enabled: bool | None = None
    type: str | None = None
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    cwd: str | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    tool_timeout: int | None = None
    enabled_tools: list[str] | None = None


@router.get("/mcp-presets")
async def list_mcp_presets(_auth: AuthDep, state: StateDep) -> dict[str, Any]:
    return {
        "user_id": state.current_user_id(),
        "presets": mcp_presets_public_list(state.config),
        "runtime": state.mcp.snapshot(),
        "templates": list_mcp_templates(),
    }


@router.get("/mcp-presets/templates")
async def mcp_preset_templates(_auth: AuthDep) -> dict[str, Any]:
    return {"templates": list_mcp_templates()}


class McpTemplateApplyBody(BaseModel):
    template_id: str
    api_key: str | None = None
    enable: bool = False


@router.post("/mcp-presets/from-template")
async def mcp_preset_from_template(
    _auth: AuthDep,
    state: StateDep,
    body: McpTemplateApplyBody,
) -> dict[str, Any]:
    templates = {t["id"]: t for t in list_mcp_templates()}
    tpl = templates.get(body.template_id)
    if tpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="unknown template")
    raw = apply_template_api_key(body.template_id, dict(tpl["preset"]), body.api_key or "")
    try:
        preset = upsert_mcp_preset(
            state.config,
            preset_id=raw.get("id"),
            label=raw.get("label"),
            enabled=bool(body.enable),
            type=raw.get("type"),
            command=raw.get("command"),
            args=raw.get("args"),
            env=raw.get("env"),
            cwd=raw.get("cwd"),
            url=raw.get("url"),
            headers=raw.get("headers"),
            tool_timeout=raw.get("tool_timeout"),
            enabled_tools=raw.get("enabled_tools"),
        )
    except McpPresetError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    state.save_config(rebuild_provider=False)
    connect = None
    if preset.enabled:
        connect = await state.mcp.connect(preset)
    return {
        "ok": True,
        "user_id": state.current_user_id(),
        "template_id": body.template_id,
        "preset": next(p for p in mcp_presets_public_list(state.config) if p["id"] == preset.id),
        "sample_invoke": tpl.get("sample_invoke"),
        "connect": connect,
        "runtime": state.mcp.snapshot(),
    }


class McpInvokeBody(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)


@router.post("/mcp-presets/{preset_id}/invoke")
async def invoke_mcp_tool(
    _auth: AuthDep,
    state: StateDep,
    preset_id: str,
    body: McpInvokeBody,
) -> dict[str, Any]:
    result = await state.mcp.invoke(preset_id, body.tool, body.arguments)
    if not result.get("ok") and result.get("error"):
        # Still 200 so Dev UI can show pipeline; mark ok false.
        return result
    return result


@router.post("/mcp-presets")
async def upsert_mcp_preset_route(
    _auth: AuthDep,
    state: StateDep,
    body: McpPresetBody,
) -> dict[str, Any]:
    try:
        preset = upsert_mcp_preset(
            state.config,
            preset_id=body.id,
            label=body.label,
            enabled=body.enabled,
            type=body.type,
            command=body.command,
            args=body.args,
            env=body.env,
            cwd=body.cwd,
            url=body.url,
            headers=body.headers,
            tool_timeout=body.tool_timeout,
            enabled_tools=body.enabled_tools,
        )
    except McpPresetError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    state.save_config(rebuild_provider=False)
    if preset.enabled:
        await state.mcp.connect(preset)
    else:
        await state.mcp.disconnect(preset.id)
    return {
        "ok": True,
        "user_id": state.current_user_id(),
        "preset": next(p for p in mcp_presets_public_list(state.config) if p["id"] == preset.id),
        "runtime": state.mcp.snapshot(),
    }


@router.delete("/mcp-presets/{preset_id}")
async def delete_mcp_preset_route(
    _auth: AuthDep,
    state: StateDep,
    preset_id: str,
) -> dict[str, Any]:
    try:
        delete_mcp_preset(state.config, preset_id)
    except McpPresetError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await state.mcp.disconnect(preset_id)
    state.save_config(rebuild_provider=False)
    return {
        "ok": True,
        "user_id": state.current_user_id(),
        "presets": mcp_presets_public_list(state.config),
        "runtime": state.mcp.snapshot(),
    }


@router.post("/mcp-presets/{preset_id}/enable")
async def enable_mcp_preset(
    _auth: AuthDep,
    state: StateDep,
    preset_id: str,
) -> dict[str, Any]:
    try:
        preset = set_mcp_enabled(state.config, preset_id, True)
    except McpPresetError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    state.save_config(rebuild_provider=False)
    result = await state.mcp.connect(preset)
    return {
        "ok": bool(result.get("ok")),
        "user_id": state.current_user_id(),
        "connect": result,
        "preset": next(p for p in mcp_presets_public_list(state.config) if p["id"] == preset.id),
        "runtime": state.mcp.snapshot(),
    }


@router.post("/mcp-presets/{preset_id}/disable")
async def disable_mcp_preset(
    _auth: AuthDep,
    state: StateDep,
    preset_id: str,
) -> dict[str, Any]:
    try:
        preset = set_mcp_enabled(state.config, preset_id, False)
    except McpPresetError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    state.save_config(rebuild_provider=False)
    await state.mcp.disconnect(preset_id)
    return {
        "ok": True,
        "user_id": state.current_user_id(),
        "preset": next(p for p in mcp_presets_public_list(state.config) if p["id"] == preset.id),
        "runtime": state.mcp.snapshot(),
    }


@router.post("/mcp-presets/test")
async def test_mcp_preset(
    _auth: AuthDep,
    state: StateDep,
    body: McpPresetBody,
) -> dict[str, Any]:
    # Prefer saved preset when id provided; otherwise body-as-ephemeral.
    preset = find_preset(state.config, body.id) if body.id else None
    if preset is None:
        try:
            preset = McpPreset(
                id=body.id or "probe",
                label=body.label or body.id or "probe",
                enabled=False,
                type=body.type,  # type: ignore[arg-type]
                command=body.command or "",
                args=list(body.args or []),
                env=dict(body.env or {}),
                cwd=body.cwd or "",
                url=body.url or "",
                headers=dict(body.headers or {}),
                tool_timeout=body.tool_timeout or 30,
                enabled_tools=list(body.enabled_tools or ["*"]),
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    result = await state.mcp.test(preset)
    return result
