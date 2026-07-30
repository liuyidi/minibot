#!/usr/bin/env python3
"""Desktop engine entrypoint.

Invokes nanobot's internal ``_run_gateway`` with ``runtime_surface=native`` and an
enabled websocket channel. Works with both editable checkouts and the installed
``nanobot-ai`` package (which may not expose ``--runtime-surface`` on the CLI).
"""

from __future__ import annotations

import os
import sys


def _load_config():
    from nanobot.config.loader import load_config, resolve_config_env_vars
    from nanobot.config.schema import Config

    cfg = resolve_config_env_vars(load_config())
    ws_port = int(os.environ.get("NANOBOT_DESKTOP_WS_PORT", "18765"))
    data = cfg.model_dump(mode="python")
    channels = dict(data.get("channels") or {})
    current = channels.get("websocket")
    websocket = dict(current) if isinstance(current, dict) else {}
    websocket["enabled"] = True
    websocket["port"] = ws_port
    channels["websocket"] = websocket
    data["channels"] = channels
    return Config.model_validate(data)


def main() -> int:
    try:
        from nanobot.cli.commands import _run_gateway
    except Exception as exc:  # noqa: BLE001
        print(f"failed to import nanobot: {exc}", file=sys.stderr)
        return 1

    health_port = int(os.environ.get("NANOBOT_DESKTOP_HEALTH_PORT", "18766"))
    try:
        cfg = _load_config()
    except Exception as exc:  # noqa: BLE001
        print(f"failed to load nanobot config: {exc}", file=sys.stderr)
        return 1

    _run_gateway(
        cfg,
        port=health_port,
        webui_runtime_surface="native",
        health_server_enabled=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
