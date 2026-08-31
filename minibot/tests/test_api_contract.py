"""API backward-compatibility contract tests.

Baseline lives in ``fixtures/api_contract_baseline.json``. When you add endpoints,
run ``uv run python scripts/export_api_contract_baseline.py`` and commit the diff.
Removing paths or response keys should fail CI until clients are updated.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from contract_compat import (
    assert_no_removed_operations,
    assert_response_contract,
    collect_openapi_operations,
    load_json_fixture,
)

_BASELINE = load_json_fixture("api_contract_baseline.json")


def _fetch_contract_samples(client: TestClient, auth_headers: dict[str, str]) -> dict[str, Any]:
    return {
        "GET /health": client.get("/health").json(),
        "GET /auth/bootstrap": client.get("/auth/bootstrap").json(),
        "GET /api/sessions": client.get("/api/sessions", headers=auth_headers).json(),
        "GET /api/settings": client.get("/api/settings", headers=auth_headers).json(),
        "GET /status.json": client.get("/status.json").json(),
        "GET /auth/config": client.get("/auth/config", headers=auth_headers).json(),
    }


def test_openapi_operations_backward_compatible(client: TestClient) -> None:
    openapi = client.app.openapi()
    current = collect_openapi_operations(openapi)
    baseline = _BASELINE["openapi_operations"]
    assert_no_removed_operations(current, baseline)


def test_critical_response_shapes_backward_compatible(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    client.post("/api/sessions", headers=auth_headers, json={})
    samples = _fetch_contract_samples(client, auth_headers)
    response_specs = _BASELINE["responses"]
    for label, spec in response_specs.items():
        assert label in samples, f"missing live sample for {label}"
        assert_response_contract(samples[label], spec, label)
