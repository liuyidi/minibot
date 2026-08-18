"""Persisted WebUI default workspace access (composer / settings)."""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, cast

logger = logging.getLogger(__name__)

WEBUI_WORKSPACE_STATE_SCHEMA_VERSION = 1
_MAX_STATE_FILE_BYTES = 32 * 1024
_DEFAULT_ACCESS_MODES = {"default", "full"}


def webui_workspace_state_path(data_dir: Path) -> Path:
    return Path(data_dir).expanduser() / "webui" / "workspace-state.json"


def default_webui_workspace_state() -> dict[str, Any]:
    return {
        "schema_version": WEBUI_WORKSPACE_STATE_SCHEMA_VERSION,
        "default_access_mode": "default",
        "webui_allow_local_service_access": True,
        "updated_at": None,
    }


def normalize_webui_workspace_state(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    raw = cast(dict[str, Any], raw)
    state = default_webui_workspace_state()
    mode = raw.get("default_access_mode")
    if mode == "restricted":
        mode = "default"
    if mode in _DEFAULT_ACCESS_MODES:
        state["default_access_mode"] = mode
    if "webui_allow_local_service_access" in raw:
        state["webui_allow_local_service_access"] = bool(raw.get("webui_allow_local_service_access"))
    updated_at = raw.get("updated_at")
    state["updated_at"] = updated_at if isinstance(updated_at, str) else None
    return state


def read_webui_workspace_state(data_dir: Path) -> dict[str, Any]:
    path = webui_workspace_state_path(data_dir)
    if not path.is_file():
        return default_webui_workspace_state()
    try:
        if path.stat().st_size > _MAX_STATE_FILE_BYTES:
            logger.warning("webui workspace state too large, ignoring: %s", path)
            return default_webui_workspace_state()
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("read webui workspace state failed %s: %s", path, exc)
        return default_webui_workspace_state()
    return normalize_webui_workspace_state(raw)


def write_webui_workspace_state(data_dir: Path, raw: dict[str, Any]) -> dict[str, Any]:
    state = normalize_webui_workspace_state(raw)
    state["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    encoded = json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
    if len(encoded) > _MAX_STATE_FILE_BYTES:
        raise ValueError("workspace state is too large")
    path = webui_workspace_state_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    with open(tmp, "wb") as f:
        f.write(encoded)
        f.write(b"\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    return state


def read_webui_default_access_mode(data_dir: Path) -> str:
    mode = read_webui_workspace_state(data_dir).get("default_access_mode")
    return mode if mode in _DEFAULT_ACCESS_MODES else "default"


def write_webui_default_access_mode(data_dir: Path, mode: str) -> dict[str, Any]:
    raw = str(mode or "").strip().lower()
    if raw == "restricted":
        raw = "default"
    if raw not in _DEFAULT_ACCESS_MODES:
        raise ValueError("webui_default_access_mode must be default or full")
    state = read_webui_workspace_state(data_dir)
    state["default_access_mode"] = raw
    return write_webui_workspace_state(data_dir, state)
