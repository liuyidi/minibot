#!/usr/bin/env python3
"""Regenerate ``tests/fixtures/api_contract_baseline.json`` after intentional API changes."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))

from fastapi.testclient import TestClient  # noqa: E402

from contract_compat import collect_openapi_operations  # noqa: E402
from fake_provider import FakeProvider, text_response  # noqa: E402
from minibot.config.settings import get_settings  # noqa: E402
from minibot.main import create_app  # noqa: E402


def main() -> None:
    tmpdir = tempfile.mkdtemp()
    os.environ["MINIBOT_SERVER_DATA_DIR"] = tmpdir
    get_settings.cache_clear()

    fp = FakeProvider(responses=[text_response("ok")])
    with patch("minibot.providers.factory.build_provider", lambda **k: fp):
        app = create_app()
        with TestClient(app) as client:
            boot = client.get("/auth/bootstrap")
            token = boot.json()["token"]
            headers = {"Authorization": f"Bearer {token}"}
            client.post("/api/sessions", headers=headers, json={})
            sessions = client.get("/api/sessions", headers=headers).json()
            settings = client.get("/api/settings", headers=headers).json()
            health = client.get("/health").json()
            status_json = client.get("/status.json").json()
            auth_config = client.get("/auth/config", headers=headers).json()

            baseline = {
                "openapi_operations": collect_openapi_operations(app.openapi()),
                "responses": {
                    "GET /health": {"required_keys": sorted(health.keys())},
                    "GET /auth/bootstrap": {"required_keys": sorted(boot.json().keys())},
                    "GET /api/sessions": {
                        "required_keys": ["sessions"],
                        "nested": {
                            "sessions": {
                                "item_required_keys": sorted(sessions["sessions"][0].keys()),
                                "nested": {
                                    "workspace_scope": {
                                        "required_keys": sorted(
                                            sessions["sessions"][0]["workspace_scope"].keys()
                                        )
                                    }
                                },
                            }
                        },
                    },
                    "GET /api/settings": {"required_keys": sorted(settings.keys())},
                    "GET /status.json": {"required_keys": sorted(status_json.keys())},
                    "GET /auth/config": {"required_keys": sorted(auth_config.keys())},
                },
            }

    out = ROOT / "tests" / "fixtures" / "api_contract_baseline.json"
    out.write_text(json.dumps(baseline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {out} ({len(baseline['openapi_operations'])} operations)")


if __name__ == "__main__":
    main()
