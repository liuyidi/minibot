"""Chat WebSocket protocol.

Phase 0.4+: chat ``message`` frames publish to MessageBus; a background worker
runs the agent turn and fans OutboundMessage back through ``hub``.
Phase 2: streaming ``delta`` / ``reasoning_*`` / ``stream_end`` events.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from minibot.app_state import AppState
from minibot.bus.events import InboundMessage, OutboundMessage
from minibot.workspace import WorkspaceError

router = APIRouter()


def _session_id(chat_id: str) -> str:
    """WebUI session keys are ``websocket:<id>``; store/loop use bare ``<id>``."""
    raw = (chat_id or "").strip()
    if raw.startswith("websocket:"):
        return raw.split(":", 1)[1].strip()
    return raw


class ConnectionHub:
    def __init__(self) -> None:
        self._by_chat: dict[str, set[WebSocket]] = {}

    def attach(self, chat_id: str, ws: WebSocket) -> None:
        self._by_chat.setdefault(chat_id, set()).add(ws)

    def detach(self, chat_id: str, ws: WebSocket) -> None:
        sockets = self._by_chat.get(chat_id)
        if not sockets:
            return
        sockets.discard(ws)
        if not sockets:
            self._by_chat.pop(chat_id, None)

    async def send(self, chat_id: str, payload: dict[str, Any]) -> None:
        sockets = list(self._by_chat.get(chat_id, set()))
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.detach(chat_id, ws)


hub = ConnectionHub()


async def deliver_outbound(msg: OutboundMessage) -> None:
    """Translate bus outbound into the Dev UI / Chat WS event sequence."""
    chat_id = msg.chat_id
    meta = msg.metadata or {}
    kind = str(meta.get("kind") or "message")
    stream_id = str(meta.get("stream_id") or "")

    if kind == "delta":
        await hub.send(
            chat_id,
            {
                "event": "delta",
                "chat_id": chat_id,
                "text": msg.content,
                "stream_id": stream_id or "s1",
            },
        )
        return

    if kind == "reasoning_delta":
        await hub.send(
            chat_id,
            {
                "event": "reasoning_delta",
                "chat_id": chat_id,
                "text": msg.content,
                "stream_id": stream_id or "r1",
            },
        )
        return

    if kind == "reasoning_end":
        await hub.send(
            chat_id,
            {
                "event": "reasoning_end",
                "chat_id": chat_id,
                "stream_id": stream_id or "r1",
            },
        )
        return

    if kind == "stream_end":
        await hub.send(
            chat_id,
            {
                "event": "stream_end",
                "chat_id": chat_id,
                "stream_id": stream_id or "s1",
            },
        )
        return

    if kind == "tool_call_start":
        name = str(meta.get("name") or msg.content or "tool")
        await hub.send(
            chat_id,
            {
                "event": "message",
                "chat_id": chat_id,
                "text": f"tool: {name}",
                "kind": "tool_hint",
            },
        )
        return

    if kind == "stream_aborted":
        await hub.send(
            chat_id,
            {
                "event": "error",
                "chat_id": chat_id,
                "detail": "aborted",
            },
        )
        return

    if kind == "provider_switched":
        await hub.send(
            chat_id,
            {
                "event": "provider_switched",
                "chat_id": chat_id,
                "from": meta.get("from"),
                "to": meta.get("to"),
                "from_label": meta.get("from_label"),
                "to_label": meta.get("to_label"),
                "from_provider": meta.get("from_provider"),
                "to_provider": meta.get("to_provider"),
                "reason": meta.get("reason"),
            },
        )
        return

    if kind == "approval_required":
        await hub.send(
            chat_id,
            {
                "event": "approval_required",
                "chat_id": chat_id,
                "approval": dict(meta.get("approval") or {}),
            },
        )
        await hub.send(chat_id, {"event": "goal_status", "chat_id": chat_id, "status": "waiting_approval"})
        return

    if kind == "turn_end":
        await hub.send(chat_id, {"event": "turn_end", "chat_id": chat_id})
        await hub.send(chat_id, {"event": "goal_status", "chat_id": chat_id, "status": "idle"})
        return

    if kind == "turn_error":
        await hub.send(
            chat_id,
            {
                "event": "error",
                "chat_id": chat_id,
                "detail": str(meta.get("detail") or "turn_error"),
            },
        )
        await hub.send(chat_id, {"event": "goal_status", "chat_id": chat_id, "status": "idle"})
        return

    if kind in {"turn_ok", "stream_aborted"}:
        tools = list(meta.get("tools_used") or [])
        if tools:
            await hub.send(
                chat_id,
                {
                    "event": "message",
                    "chat_id": chat_id,
                    "text": f"tools: {', '.join(str(t) for t in tools)}",
                    "kind": "tool_hint",
                },
            )
        # When the answer was already streamed (``delta`` + ``stream_end``),
        # do not re-send full text — WebUI clears its stream buffer on
        # ``stream_end``, so a follow-up ``message`` becomes a duplicate bubble.
        if msg.content and not meta.get("_streamed"):
            await hub.send(
                chat_id,
                {
                    "event": "message",
                    "chat_id": chat_id,
                    "text": msg.content,
                },
            )
        await hub.send(
            chat_id,
            {
                "event": "agent_trace",
                "chat_id": chat_id,
                "trace": list(meta.get("trace") or []),
                "stop_reason": meta.get("stop_reason"),
                "tools_used": tools,
                "langfuse_trace_id": meta.get("langfuse_trace_id") or "",
                "reasoning": meta.get("reasoning") or "",
                "used_provider": meta.get("used_provider") or "",
                "used_preset": meta.get("used_preset") or "",
            },
        )
        return

    # Legacy single-shot message
    tools = list(meta.get("tools_used") or [])
    if tools:
        await hub.send(
            chat_id,
            {
                "event": "message",
                "chat_id": chat_id,
                "text": f"tools: {', '.join(str(t) for t in tools)}",
                "kind": "tool_hint",
            },
        )
    await hub.send(
        chat_id,
        {
            "event": "message",
            "chat_id": chat_id,
            "text": msg.content,
        },
    )
    await hub.send(
        chat_id,
        {
            "event": "agent_trace",
            "chat_id": chat_id,
            "trace": list(meta.get("trace") or []),
            "stop_reason": meta.get("stop_reason"),
            "tools_used": tools,
            "langfuse_trace_id": meta.get("langfuse_trace_id") or "",
        },
    )
    await hub.send(chat_id, {"event": "turn_end", "chat_id": chat_id})
    await hub.send(chat_id, {"event": "goal_status", "chat_id": chat_id, "status": "idle"})


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    state: AppState = websocket.app.state.app_state
    token = websocket.query_params.get("token")
    if not state.check_token(token):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    known: set[str] = set()
    # Ephemeral id for protocol compatibility only — do NOT persist a session
    # on connect (minibot does the same). Persisting here made every refresh /
    # reconnect spawn an empty sidebar chat.
    default_chat: str | None = uuid.uuid4().hex[:12]

    try:
        await websocket.send_json(
            {
                "event": "ready",
                "chat_id": default_chat,
                "client_id": "webui",
            }
        )

        while True:
            raw = await websocket.receive_text()
            try:
                frame = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"event": "error", "detail": "invalid_json"})
                continue

            msg_type = frame.get("type")
            if msg_type in {"abort", "stop"}:
                chat_id = _session_id(str(frame.get("chat_id") or default_chat or ""))
                if chat_id:
                    state.loop.request_abort(chat_id)
                continue

            if msg_type == "approval_response":
                approval_id = str(frame.get("approval_id") or "")
                decision = str(frame.get("decision") or "")
                if decision not in {"approve", "reject"} or not approval_id:
                    await websocket.send_json({"event": "error", "detail": "invalid_approval_response"})
                    continue
                try:
                    await state.loop.resolve_approval(
                        approval_id, decision, bus=state.bus, channel="websocket"
                    )
                except (KeyError, ValueError) as exc:
                    await websocket.send_json({"event": "error", "detail": str(exc)})
                continue

            if msg_type == "new_chat":
                scope = frame.get("workspace_scope") if isinstance(frame.get("workspace_scope"), dict) else {}
                project = str(scope.get("project_path") or "").strip() or None
                try:
                    session = state.sessions.create(workspace=project)
                except WorkspaceError as exc:
                    await websocket.send_json(
                        {"event": "error", "detail": f"workspace: {exc}"}
                    )
                    continue
                known.add(session.id)
                hub.attach(session.id, websocket)
                await websocket.send_json(
                    {
                        "event": "attached",
                        "chat_id": session.id,
                        "workspace_path": session.workspace_path,
                    }
                )
                continue

            if msg_type == "set_workspace_scope":
                chat_id = _session_id(str(frame.get("chat_id") or default_chat or ""))
                scope = frame.get("workspace_scope") if isinstance(frame.get("workspace_scope"), dict) else {}
                project = str(
                    scope.get("project_path")
                    or frame.get("workspace_path")
                    or frame.get("project_path")
                    or ""
                ).strip()
                if not chat_id or not project:
                    await websocket.send_json(
                        {
                            "event": "error",
                            "chat_id": chat_id,
                            "detail": "missing_chat_or_workspace",
                        }
                    )
                    continue
                if state.sessions.get(chat_id) is None:
                    await websocket.send_json(
                        {"event": "error", "chat_id": chat_id, "detail": "unknown_chat"}
                    )
                    continue
                try:
                    session = state.sessions.set_workspace(chat_id, project)
                except WorkspaceError as exc:
                    await websocket.send_json(
                        {
                            "event": "error",
                            "chat_id": chat_id,
                            "detail": f"workspace: {exc}",
                        }
                    )
                    continue
                known.add(chat_id)
                hub.attach(chat_id, websocket)
                await websocket.send_json(
                    {
                        "event": "workspace_updated",
                        "chat_id": chat_id,
                        "workspace_path": session.workspace_path,
                        "workspace_scope": {
                            "project_path": session.workspace_path,
                            "access_mode": str(scope.get("access_mode") or "restricted"),
                        },
                    }
                )
                continue

            if msg_type == "attach":
                chat_id = _session_id(str(frame.get("chat_id") or ""))
                session = state.sessions.get(chat_id) if chat_id else None
                # Only bind existing sessions. Creating on attach would turn every
                # mis-keyed attach / reconnect into another empty sidebar row.
                if session is None:
                    await websocket.send_json(
                        {"event": "error", "chat_id": chat_id, "detail": "unknown_chat"}
                    )
                    continue
                known.add(session.id)
                hub.attach(session.id, websocket)
                await websocket.send_json(
                    {
                        "event": "attached",
                        "chat_id": session.id,
                        "workspace_path": session.workspace_path,
                    }
                )
                continue

            if msg_type == "message":
                chat_id = _session_id(str(frame.get("chat_id") or default_chat or ""))
                content = str(frame.get("content") or "").strip()
                if not chat_id or not content:
                    await websocket.send_json(
                        {"event": "error", "chat_id": chat_id, "detail": "missing_chat_or_content"}
                    )
                    continue
                session = state.sessions.get(chat_id)
                if session is None:
                    await websocket.send_json(
                        {"event": "error", "chat_id": chat_id, "detail": "unknown_chat"}
                    )
                    continue
                known.add(chat_id)
                hub.attach(chat_id, websocket)
                await hub.send(chat_id, {"event": "goal_status", "chat_id": chat_id, "status": "running"})
                await state.bus.publish_inbound(
                    InboundMessage(
                        channel="websocket",
                        sender_id="webui",
                        chat_id=chat_id,
                        content=content,
                    )
                )
                continue

            await websocket.send_json(
                {"event": "error", "detail": f"unknown_type:{msg_type}"}
            )
    except WebSocketDisconnect:
        pass
    finally:
        for chat_id in list(known):
            hub.detach(chat_id, websocket)
