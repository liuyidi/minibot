"""Phase 6: provider registry, Anthropic conversion, nanobot import."""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from minibot.config.app_config import AppConfig
from minibot.config.nanobot_import import import_nanobot_into_config, preview_nanobot_import
from minibot.config.presets import PresetError, activate_preset, ensure_presets, upsert_preset
from minibot.providers.anthropic import (
    AnthropicProvider,
    convert_messages,
    openai_tools_to_anthropic,
)
from minibot.providers.factory import ProviderError, build_provider
from minibot.providers.openai_compat import OpenAICompatProvider
from minibot.providers.registry import find_by_name, list_providers, resolve_spec


def test_registry_lists_implemented_and_stubs() -> None:
    names = {p["name"] for p in list_providers(include_stubs=True)}
    assert "openai" in names
    assert "anthropic" in names
    assert "bedrock" in names
    anth = find_by_name("anthropic")
    assert anth is not None
    assert anth.backend == "anthropic"
    assert anth.implemented is True
    assert find_by_name("bedrock") is not None
    assert find_by_name("bedrock").implemented is False


def test_resolve_spec_heuristics() -> None:
    assert resolve_spec(model="claude-3-5-sonnet").name == "anthropic"
    assert resolve_spec(api_base="https://api.deepseek.com/v1").name == "deepseek"
    assert resolve_spec(provider="openrouter").name == "openrouter"


def test_factory_builds_openai_and_anthropic() -> None:
    oai = build_provider(provider="openai", api_key="sk-x", api_base="https://api.openai.com/v1")
    assert isinstance(oai, OpenAICompatProvider)
    anth = build_provider(provider="anthropic", api_key="sk-ant", api_base="https://api.anthropic.com")
    assert isinstance(anth, AnthropicProvider)
    with pytest.raises(ProviderError, match="not implemented"):
        build_provider(provider="bedrock", api_key="x")


def test_convert_messages_and_tools() -> None:
    system, msgs = convert_messages(
        [
            {"role": "system", "content": "you are helpful"},
            {"role": "user", "content": "hi"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "echo", "arguments": '{"x":1}'},
                    }
                ],
            },
            {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
        ]
    )
    assert system == "you are helpful"
    assert msgs[0]["role"] == "user"
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["content"][0]["type"] == "tool_use"
    assert msgs[2]["role"] == "user"
    assert msgs[2]["content"][0]["type"] == "tool_result"
    tools = openai_tools_to_anthropic(
        [
            {
                "type": "function",
                "function": {
                    "name": "echo",
                    "description": "d",
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        ]
    )
    assert tools[0]["name"] == "echo"
    assert "input_schema" in tools[0]


@pytest.mark.asyncio
async def test_anthropic_chat_parses_tool_use(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = AnthropicProvider(api_key="sk-test", base_url="https://api.anthropic.com")

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url).endswith("/v1/messages")
        assert request.headers.get("x-api-key") == "sk-test"
        body = {
            "content": [
                {"type": "text", "text": "calling"},
                {"type": "tool_use", "id": "toolu_1", "name": "echo", "input": {"q": "hi"}},
            ],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 10, "output_tokens": 5},
        }
        return httpx.Response(200, json=body)

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    class _Client:
        def __init__(self, *args, **kwargs):
            self._inner = real_async_client(transport=transport)

        async def __aenter__(self):
            return self._inner

        async def __aexit__(self, *exc):
            await self._inner.aclose()

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    resp = await provider.chat(
        [{"role": "user", "content": "hi"}],
        tools=[
            {
                "type": "function",
                "function": {"name": "echo", "parameters": {"type": "object"}},
            }
        ],
        model="claude-sonnet-4-20250514",
    )
    assert resp.finish_reason == "tool_calls"
    assert resp.content == "calling"
    assert resp.tool_calls[0].name == "echo"
    assert resp.tool_calls[0].arguments == {"q": "hi"}
    assert resp.usage and resp.usage["prompt_tokens"] == 10


def test_activate_anthropic_preset() -> None:
    cfg = AppConfig(openai_api_key="old", openai_base_url="https://api.openai.com/v1")
    ensure_presets(cfg)
    upsert_preset(
        cfg,
        preset_id="claude",
        label="Claude",
        provider="anthropic",
        model="claude-sonnet-4-20250514",
        api_key="sk-ant-test-xxxx",
        api_base="https://api.anthropic.com",
        activate=True,
    )
    assert cfg.provider == "anthropic"
    assert cfg.model.startswith("claude")
    provider = build_provider(
        provider=cfg.provider, model=cfg.model, api_key=cfg.openai_api_key, api_base=cfg.openai_base_url
    )
    assert isinstance(provider, AnthropicProvider)


def test_activate_stub_provider_fails() -> None:
    cfg = AppConfig(openai_api_key="k", openai_base_url="https://x")
    ensure_presets(cfg)
    cfg.model_presets.append(
        cfg.model_presets[0].model_copy(
            update={
                "id": "bedrock",
                "label": "Bedrock",
                "provider": "bedrock",
                "api_key": "tok",
                "api_base": "",
            }
        )
    )
    with pytest.raises(PresetError, match="not implemented"):
        activate_preset(cfg, "bedrock")


def test_nanobot_import(tmp_path) -> None:
    nanobot_cfg = {
        "agents": {"defaults": {"model": "gpt-4o-mini"}},
        "providers": {
            "openai": {"apiKey": "sk-openai-aaaa1111", "apiBase": "https://api.openai.com/v1"},
            "anthropic": {"apiKey": "sk-ant-bbbb2222", "apiBase": "https://api.anthropic.com"},
            "bedrock": {"apiKey": "aws-token"},
        },
    }
    path = tmp_path / "config.json"
    path.write_text(json.dumps(nanobot_cfg), encoding="utf-8")
    preview = preview_nanobot_import(path)
    assert preview["ok"] is True
    assert "openai" in preview["provider_keys_found"]

    cfg = AppConfig(openai_api_key="seed-key-zzzz", openai_base_url="https://api.openai.com/v1")
    ensure_presets(cfg)
    result = import_nanobot_into_config(cfg, path=path, activate_first=True)
    assert result["ok"] is True
    assert any(p.startswith("nanobot-") for p in result["created"])
    assert "bedrock" in result["skipped"] or any("bedrock" in s for s in result["skipped"])
    ids = {p.id for p in cfg.model_presets}
    assert any("anthropic" in i for i in ids)


def test_dev_providers_api(client: TestClient, auth_headers: dict[str, str]) -> None:
    res = client.get("/api/dev/providers", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert any(p["name"] == "anthropic" for p in body["registry"])
    assert "backend" in body["active"]


def test_create_anthropic_preset_api(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/settings/model-configurations",
        headers=auth_headers,
        json={
            "id": "claude",
            "label": "Claude",
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "api_key": "sk-ant-test-zzzz",
            "api_base": "https://api.anthropic.com",
            "activate": True,
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["active_preset"] == "claude"
    assert body["agent"]["provider"] == "anthropic"
    claude = next(p for p in body["model_presets"] if p["id"] == "claude")
    assert claude["backend"] == "anthropic"
