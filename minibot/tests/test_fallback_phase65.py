"""Phase 6.5: FallbackProvider + preset.fallback chain."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from minibot.config.app_config import AppConfig
from minibot.config.presets import ensure_presets, upsert_preset
from minibot.providers.base import LLMResponse
from minibot.providers.factory import build_provider_chain
from minibot.providers.fallback import (
    FallbackProvider,
    FallbackStats,
    ProviderSlot,
    is_failover_response,
)
from minibot.providers.openai_compat import OpenAICompatProvider
from fake_provider import FakeProvider, text_response


def test_is_failover_response() -> None:
    assert is_failover_response(LLMResponse(content="x", finish_reason="error"))
    assert not is_failover_response(LLMResponse(content="ok", finish_reason="stop"))


@pytest.mark.asyncio
async def test_fault_inject_soft_then_backup() -> None:
    from minibot.providers.fault_inject import FaultController, FaultInjectingProvider

    primary_inner = FakeProvider(responses=[text_response("should-not-see")])
    backup = FakeProvider(responses=[text_response("from backup")])
    ctl = FaultController()
    ctl.arm("soft_error", oneshot=True)
    primary = FaultInjectingProvider(primary_inner, ctl)
    fb = FallbackProvider(
        [
            ProviderSlot("a", "A", "openai", "m", "openai_compat", primary),
            ProviderSlot("b", "B", "openai", "m", "openai_compat", backup),
        ]
    )
    resp = await fb.chat([{"role": "user", "content": "hi"}], model="m")
    assert resp.content == "from backup"
    assert fb.stats.switches == 1
    assert fb.stats.last_switch and fb.stats.last_switch["reason_kind"] == "soft_error"


@pytest.mark.asyncio
async def test_simulate_offline_modes() -> None:
    from minibot.providers.fault_inject import simulate_fallback_chain

    for mode in ("soft_error", "http_429", "http_503", "timeout", "connection"):
        out = await simulate_fallback_chain(mode=mode)
        assert out["used_preset"] == "backup"
        assert out["reason_kind"]


@pytest.mark.asyncio
async def test_fallback_provider_chat_switches() -> None:
    primary = FakeProvider(
        responses=[LLMResponse(content="LLM error HTTP 401: bad key", finish_reason="error")]
    )
    backup = FakeProvider(responses=[text_response("from backup")])
    stats = FallbackStats()
    seen: list[dict] = []
    fb = FallbackProvider(
        [
            ProviderSlot("bad", "Bad", "openai", "m1", "openai_compat", primary),
            ProviderSlot("good", "Good", "openai", "m2", "openai_compat", backup),
        ],
        stats=stats,
        on_switch=seen.append,
    )
    resp = await fb.chat([{"role": "user", "content": "hi"}], model="m1")
    assert resp.content == "from backup"
    assert fb.last_used.id == "good"
    assert stats.switches == 1
    assert seen and seen[0]["from"] == "bad" and seen[0]["to"] == "good"
    pending = fb.drain_switches()
    assert pending and pending[0]["to"] == "good"
    meta = fb.used_meta()
    assert meta["used_preset"] == "good"


@pytest.mark.asyncio
async def test_fallback_stream_switches_before_content() -> None:
    # Use an empty stream script so FakeProvider yields only StreamEnd(error)
    # (no TextDelta). The synthesize path would emit error text as a delta first,
    # which correctly blocks failover after content has started.
    primary = FakeProvider(
        responses=[LLMResponse(content="LLM error HTTP 503: down", finish_reason="error")],
        streams=[[]],
    )
    backup = FakeProvider(responses=[text_response("stream ok")])
    fb = FallbackProvider(
        [
            ProviderSlot("a", "A", "openai", "m", "openai_compat", primary),
            ProviderSlot("b", "B", "openai", "m", "openai_compat", backup),
        ]
    )
    parts: list[str] = []
    finish = ""
    async for ev in fb.chat_stream([{"role": "user", "content": "x"}], model="m"):
        from minibot.providers.base import StreamEnd, TextDelta

        if isinstance(ev, TextDelta):
            parts.append(ev.text)
        elif isinstance(ev, StreamEnd):
            finish = ev.finish_reason
            if ev.content:
                parts.append(ev.content)
    assert finish != "error"
    assert "stream ok" in "".join(parts) or fb.last_used.id == "b"
    assert fb.stats.switches >= 1


def test_build_provider_chain_wraps_fallback() -> None:
    cfg = AppConfig(openai_api_key="k1", openai_base_url="https://api.openai.com/v1")
    ensure_presets(cfg)
    upsert_preset(
        cfg,
        preset_id="backup",
        label="Backup",
        model="gpt-4o-mini",
        api_key="k2-xxxxxx",
        api_base="https://api.openai.com/v1",
    )
    upsert_preset(
        cfg,
        preset_id="default",
        fallback=["backup"],
    )
    # activate default with fallback
    from minibot.config.presets import activate_preset

    # ensure default has key
    cfg.model_presets[0] = cfg.model_presets[0].model_copy(
        update={"api_key": "k1-primary", "fallback": ["backup"]}
    )
    activate_preset(cfg, "default")
    provider = build_provider_chain(cfg)
    assert isinstance(provider, FallbackProvider)
    assert [s.id for s in provider.slots] == ["default", "backup"]


def test_build_chain_single_without_fallback() -> None:
    cfg = AppConfig(openai_api_key="k", openai_base_url="https://api.openai.com/v1")
    ensure_presets(cfg)
    provider = build_provider_chain(cfg)
    assert isinstance(provider, OpenAICompatProvider)


def test_settings_fallback_api(client: TestClient, auth_headers: dict[str, str]) -> None:
    # create backup then set fallback on default
    created = client.post(
        "/api/settings/model-configurations",
        headers=auth_headers,
        json={
            "id": "backup",
            "label": "Backup",
            "model": "gpt-4o-mini",
            "api_key": "sk-backup-zzzz",
            "api_base": "https://api.openai.com/v1",
        },
    )
    assert created.status_code == 200
    updated = client.post(
        "/api/settings/model-configurations",
        headers=auth_headers,
        json={"id": "default", "fallback": ["backup"]},
    )
    assert updated.status_code == 200
    presets = updated.json()["model_presets"]
    default = next(p for p in presets if p["id"] == "default")
    assert default["fallback"] == ["backup"]

    # activate default to rebuild chain
    act = client.post(
        "/api/settings/model-configurations/default/activate",
        headers=auth_headers,
    )
    assert act.status_code == 200
    runtime = client.get("/api/dev/runtime", headers=auth_headers)
    assert runtime.status_code == 200
    fb = runtime.json()["fallback"]
    assert fb["active_is_fallback"] is True
    assert fb["rules"]
    assert "fault" in fb
    assert len(fb["chain"]) >= 2

    # Offline simulate each trigger kind (no real LLM)
    for mode in ("soft_error", "http_429", "http_503", "timeout", "connection"):
        sim = client.post(
            "/api/dev/fallback/simulate",
            headers=auth_headers,
            json={"mode": mode},
        )
        assert sim.status_code == 200, mode
        body = sim.json()
        assert body["used_preset"] == "backup"
        assert body["switches"] >= 1
        assert body["reason_kind"]

    arm = client.post(
        "/api/dev/fallback/arm",
        headers=auth_headers,
        json={"mode": "http_429"},
    )
    assert arm.status_code == 200
    assert arm.json()["fault"]["armed"] is True
    disarm = client.post("/api/dev/fallback/disarm", headers=auth_headers, json={})
    assert disarm.status_code == 200
    assert disarm.json()["fault"]["armed"] is False
