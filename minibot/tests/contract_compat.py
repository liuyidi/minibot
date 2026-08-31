"""Helpers for API backward-compatibility contract tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options"})

_FIXTURES = Path(__file__).resolve().parent / "fixtures"


def fixtures_dir() -> Path:
    return _FIXTURES


def load_json_fixture(name: str) -> Any:
    path = _FIXTURES / name
    return json.loads(path.read_text(encoding="utf-8"))


def collect_openapi_operations(openapi: dict[str, Any]) -> list[str]:
    """Return sorted ``METHOD path`` signatures from an OpenAPI document."""
    ops: list[str] = []
    for path, methods in openapi.get("paths", {}).items():
        if not isinstance(path, str) or not isinstance(methods, dict):
            continue
        for method in methods:
            if method.lower() in _HTTP_METHODS:
                ops.append(f"{method.upper()} {path}")
    return sorted(ops)


def assert_required_keys(payload: Any, required: list[str], label: str) -> None:
    if not isinstance(payload, dict):
        raise AssertionError(f"{label}: expected object, got {type(payload).__name__}")
    missing = [key for key in required if key not in payload]
    if missing:
        raise AssertionError(f"{label}: missing keys {missing}")


def assert_no_removed_operations(current: list[str], baseline: list[str]) -> None:
    removed = sorted(set(baseline) - set(current))
    if removed:
        raise AssertionError(
            "OpenAPI backward-compat break: removed operations\n"
            + "\n".join(f"  - {op}" for op in removed)
        )


def assert_response_contract(payload: Any, spec: dict[str, Any], label: str) -> None:
    """Validate live JSON against a baseline response spec."""
    required = spec.get("required_keys")
    if isinstance(required, list):
        assert_required_keys(payload, required, label)

    item_required = spec.get("item_required_keys")
    if isinstance(item_required, list) and isinstance(payload, list) and payload:
        assert_required_keys(payload[0], item_required, f"{label}[0]")

    nested = spec.get("nested")
    if not isinstance(nested, dict) or not isinstance(payload, dict):
        return
    for key, child_spec in nested.items():
        if not isinstance(child_spec, dict):
            continue
        child = payload.get(key)
        if key in payload and isinstance(child, list) and child_spec.get("item_required_keys"):
            assert_response_contract(child, child_spec, f"{label}.{key}")
        else:
            assert_response_contract(child, child_spec, f"{label}.{key}")
