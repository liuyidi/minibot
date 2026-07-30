"""Public status page and status JSON for bot.liuyidi.me."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse

from minibot import __version__
from minibot.api.deps import StateDep
from minibot.observability import langfuse as lf
from minibot.webui_static import resolve_webui_dist

router = APIRouter(tags=["status"])

_TEMPLATE = Path(__file__).resolve().parents[2] / "static" / "status" / "index.html"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _now().isoformat()


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def _availability(status: str) -> float | None:
    if status == "operational":
        return 100.0
    if status in {"degraded", "outage"}:
        return 0.0
    return None


def _history(status: str, days: int = 30) -> list[str]:
    if status == "disabled":
        return ["disabled"] * days
    return [status] * days


def _component(
    *,
    key: str,
    required: bool,
    status: str,
    label_zh: str,
    label_en: str,
    desc_zh: str,
    desc_en: str,
    details_zh: list[str],
    details_en: list[str],
) -> dict[str, Any]:
    return {
        "key": key,
        "required": required,
        "status": status,
        "availability": _availability(status),
        "history": _history(status),
        "label": {"zh": label_zh, "en": label_en},
        "description": {"zh": desc_zh, "en": desc_en},
        "details": {"zh": details_zh, "en": details_en},
    }


def _component_state_label(status: str, lang: str) -> str:
    labels = {
        "zh": {
            "operational": "一切正常",
            "degraded": "部分受影响",
            "outage": "服务中断",
            "disabled": "未启用",
        },
        "en": {
            "operational": "Operational",
            "degraded": "Degraded",
            "outage": "Outage",
            "disabled": "Disabled",
        },
    }
    return labels["en" if lang == "en" else "zh"].get(status, status)


def _overall_copy(lang: str, overall_status: str, optional_disabled: int) -> dict[str, str]:
    if lang == "en":
        if overall_status == "outage":
            return {
                "title": "Partial outage",
                "subtitle": "One or more required services are currently unavailable.",
                "badge": "Attention needed",
            }
        if overall_status == "degraded":
            return {
                "title": "Degraded performance",
                "subtitle": "Core services are up, but one or more required systems are impaired.",
                "badge": "Monitoring",
            }
        return {
            "title": "All systems operational",
            "subtitle": (
                "Core services are healthy. "
                f"{optional_disabled} optional integrations are currently disabled or unconfigured."
            ),
            "badge": "Healthy",
        }
    if overall_status == "outage":
        return {
            "title": "部分服务中断",
            "subtitle": "有一个或多个必需服务当前不可用。",
            "badge": "需要关注",
        }
    if overall_status == "degraded":
        return {
            "title": "性能有所下降",
            "subtitle": "核心服务可用，但一个或多个必需系统受到了影响。",
            "badge": "持续观察",
        }
    return {
        "title": "一切运行正常",
        "subtitle": f"核心服务健康运行。当前有 {optional_disabled} 个可选集成处于未启用或未配置状态。",
        "badge": "状态良好",
    }


async def _probe_minikb(state: Any) -> dict[str, Any]:
    base_url = (state.settings.minikb_base_url or "").strip()
    if not base_url:
        return {
            "status": "disabled",
            "probe": None,
            "base_url": "",
            "availability": None,
        }

    url = base_url.rstrip("/") + "/health"
    try:
        timeout = httpx.Timeout(connect=1.5, read=2.5, write=2.5, pool=1.5)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            res = await client.get(url, headers={"Accept": "application/json"})
        if res.status_code == 200:
            return {
                "status": "operational",
                "probe": "ok",
                "base_url": base_url,
                "availability": 100.0,
            }
        return {
            "status": "degraded",
            "probe": f"http {res.status_code}",
            "base_url": base_url,
            "availability": 0.0,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "degraded",
            "probe": f"{type(exc).__name__}: {exc}",
            "base_url": base_url,
            "availability": 0.0,
        }


def _build_components(state: Any, minikb: dict[str, Any]) -> list[dict[str, Any]]:
    settings = state.settings
    webui_dist = resolve_webui_dist()
    webui_ok = webui_dist is not None
    core_ok = state.loop is not None and state.runner is not None and state.bus_worker is not None
    mcp_snap = state.mcp.snapshot()
    mcp_servers = mcp_snap.get("servers") or []
    mcp_tools = mcp_snap.get("injected_tools") or []
    cron_status = state.cron.status() if state.cron is not None else {"running": False, "job_count": 0, "enabled_count": 0}
    obs_enabled = bool(getattr(settings, "langfuse_enabled", False))
    obs_ok = lf.is_enabled()

    components = [
        _component(
            key="core_runtime",
            required=True,
            status="operational" if core_ok else "outage",
            label_zh="核心运行时",
            label_en="Core runtime",
            desc_zh="AgentLoop、MessageBus、Runner、Sessions",
            desc_en="AgentLoop, MessageBus, Runner, Sessions",
            details_zh=["AgentLoop", "MessageBus", "Runner", "Sessions"],
            details_en=["AgentLoop", "MessageBus", "Runner", "Sessions"],
        ),
        _component(
            key="public_api",
            required=True,
            status="operational",
            label_zh="公共 API / WS",
            label_en="Public API / WS",
            desc_zh="bootstrap、REST、WebSocket、流式输出",
            desc_en="bootstrap, REST, WebSocket, streaming",
            details_zh=["bootstrap", "REST", "WebSocket", "流式输出"],
            details_en=["bootstrap", "REST", "WebSocket", "streaming"],
        ),
        _component(
            key="public_ui",
            required=True,
            status="operational" if webui_ok or _template_exists() else "degraded",
            label_zh="公共 UI",
            label_en="Public UI",
            desc_zh="WebUI SPA 或内嵌 Dev UI",
            desc_en="WebUI SPA or embedded Dev UI",
            details_zh=[
                "WebUI SPA mounted at /" if webui_ok else "Dev UI available at /ui/",
                "bot.liuyidi.me/status",
            ],
            details_en=[
                "WebUI SPA mounted at /" if webui_ok else "Dev UI available at /ui/",
                "bot.liuyidi.me/status",
            ],
        ),
        _component(
            key="auth_bootstrap",
            required=True,
            status="operational",
            label_zh="鉴权 / Bootstrap",
            label_en="Auth / Bootstrap",
            desc_zh="Bearer、X-Minibot-Auth、X-Nanobot-Auth",
            desc_en="Bearer, X-Minibot-Auth, X-Nanobot-Auth",
            details_zh=["Bearer", "X-Minibot-Auth", "X-Nanobot-Auth"],
            details_en=["Bearer", "X-Minibot-Auth", "X-Nanobot-Auth"],
        ),
        _component(
            key="tools_mcp",
            required=True,
            status="operational",
            label_zh="工具 / MCP",
            label_en="Tools / MCP",
            desc_zh="filesystem、exec、web、kb、memory、MCP 连接",
            desc_en="filesystem, exec, web, kb, memory, MCP connections",
            details_zh=[
                f"注册工具：{len(state.tools.list_meta())}",
                f"MCP 服务：{len(mcp_servers)}",
                f"注入工具：{len(mcp_tools)}",
            ],
            details_en=[
                f"Registered tools: {len(state.tools.list_meta())}",
                f"MCP servers: {len(mcp_servers)}",
                f"Injected tools: {len(mcp_tools)}",
            ],
        ),
        _component(
            key="cron_automations",
            required=True,
            status="operational" if cron_status.get("running") else "degraded",
            label_zh="Cron / Automations",
            label_en="Cron / Automations",
            desc_zh="计划任务、自动触发与队列执行",
            desc_en="Scheduled tasks, auto triggers and queued execution",
            details_zh=[
                f"任务数：{cron_status.get('job_count', 0)}",
                f"启用数：{cron_status.get('enabled_count', 0)}",
                f"运行中：{'是' if cron_status.get('running') else '否'}",
            ],
            details_en=[
                f"Jobs: {cron_status.get('job_count', 0)}",
                f"Enabled: {cron_status.get('enabled_count', 0)}",
                f"Running: {'yes' if cron_status.get('running') else 'no'}",
            ],
        ),
        _component(
            key="knowledge_base",
            required=False,
            status=minikb["status"],
            label_zh="知识库",
            label_en="Knowledge base",
            desc_zh="只读检索转发到 minikb",
            desc_en="Read-only retrieval forwarded to minikb",
            details_zh=[
                "minikb 未配置" if minikb["status"] == "disabled" else f"minikb: {minikb['base_url']}",
                f"探测：{minikb['probe'] or 'ok'}" if minikb["status"] != "disabled" else "可选集成",
            ],
            details_en=[
                "minikb not configured" if minikb["status"] == "disabled" else f"minikb: {minikb['base_url']}",
                f"Probe: {minikb['probe'] or 'ok'}" if minikb["status"] != "disabled" else "Optional integration",
            ],
        ),
        _component(
            key="observability",
            required=False,
            status="operational" if obs_ok else ("degraded" if obs_enabled else "disabled"),
            label_zh="观测 / 评估",
            label_en="Observability / Eval",
            desc_zh="mini-langfuse 旁路、Trace、Score、Prompt",
            desc_en="mini-langfuse sidecar, trace, score, prompt",
            details_zh=[
                "mini-langfuse 已启用" if obs_ok else (
                    "已配置，但 SDK / keys 未就绪" if obs_enabled else "未启用"
                ),
                f"当前状态：{'在线' if obs_ok else ('降级' if obs_enabled else '关闭')}",
            ],
            details_en=[
                "mini-langfuse enabled" if obs_ok else (
                    "Configured, but SDK / keys are not ready" if obs_enabled else "Disabled"
                ),
                f"Current state: {'online' if obs_ok else ('degraded' if obs_enabled else 'off')}",
            ],
        ),
    ]
    return components


def _template_exists() -> bool:
    return _TEMPLATE.is_file()


async def build_status_payload(state: Any) -> dict[str, Any]:
    minikb = await _probe_minikb(state)
    components = _build_components(state, minikb)
    required = [item for item in components if item["required"]]
    required_states = {item["status"] for item in required}
    if "outage" in required_states:
        overall_status = "outage"
    elif "degraded" in required_states:
        overall_status = "degraded"
    else:
        overall_status = "operational"

    optional_disabled = sum(1 for item in components if not item["required"] and item["status"] == "disabled")
    overall = {
        "status": overall_status,
        "label": {
            "zh": _overall_copy("zh", overall_status, optional_disabled)["title"],
            "en": _overall_copy("en", overall_status, optional_disabled)["title"],
        },
        "subtitle": {
            "zh": _overall_copy("zh", overall_status, optional_disabled)["subtitle"],
            "en": _overall_copy("en", overall_status, optional_disabled)["subtitle"],
        },
        "badge": {
            "zh": _overall_copy("zh", overall_status, optional_disabled)["badge"],
            "en": _overall_copy("en", overall_status, optional_disabled)["badge"],
        },
    }
    incidents: list[dict[str, Any]] = []
    now = _now()
    for item in components:
        if item["status"] in {"degraded", "outage"}:
            incidents.append(
                {
                    "date": now.date().isoformat(),
                    "time": now.isoformat(),
                    "severity": item["status"],
                    "component": item["key"],
                    "label": item["label"],
                    "title": {
                        "zh": f"{item['label']['zh']} 出现{('故障' if item['status'] == 'outage' else '降级')}",
                        "en": f"{item['label']['en']} is {('down' if item['status'] == 'outage' else 'degraded')}",
                    },
                    "detail": item["description"],
                }
            )

    return {
        "generated_at": now.isoformat(),
        "runtime": {
            "name": "minibot",
            "version": __version__,
            "started_at": datetime.fromtimestamp(state.started_at, tz=timezone.utc).isoformat(),
            "uptime_seconds": round(max(0.0, time.time() - state.started_at), 1),
            "host": state.settings.host,
            "port": state.settings.port,
        },
        "overall": overall,
        "components": components,
        "incidents": incidents,
        "optional_disabled": optional_disabled,
        "links": {
            "health": "/health",
            "ui": "/ui/",
            "status_json": "/status.json",
        },
    }


def _render_status_html(payload: dict[str, Any]) -> str:
    template = _TEMPLATE.read_text(encoding="utf-8")
    boot = _json_dumps(payload)
    return template.replace("__STATUS_BOOTSTRAP__", boot)


@router.get("/status", include_in_schema=False)
@router.get("/status/", include_in_schema=False)
async def status_page(state: StateDep) -> HTMLResponse:
    payload = await build_status_payload(state)
    html = _render_status_html(payload)
    return HTMLResponse(
        html,
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.get("/status.json", include_in_schema=False)
async def status_json(state: StateDep) -> JSONResponse:
    payload = await build_status_payload(state)
    return JSONResponse(payload, headers={"Cache-Control": "no-store, max-age=0"})


@router.get("/api/status", include_in_schema=False)
async def api_status(state: StateDep) -> JSONResponse:
    payload = await build_status_payload(state)
    return JSONResponse(payload, headers={"Cache-Control": "no-store, max-age=0"})
