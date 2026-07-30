"""Context usage estimate helpers + API."""

from __future__ import annotations

from fastapi.testclient import TestClient

from minibot.context_estimate import build_context_usage, estimate_tokens, format_token_short


def test_estimate_tokens_and_format() -> None:
    assert estimate_tokens("") == 0
    assert estimate_tokens("abcd") == 1
    assert format_token_short(38900) == "38.9k"
    assert format_token_short(903900) == "903.9k"
    assert format_token_short(42) == "42"


def test_build_context_usage_breakdown() -> None:
    data = build_context_usage(
        messages=[{"role": "user", "content": "hello world " * 20}],
        system_prompt="You are minibot. " * 10,
        tool_definitions=[{"type": "function", "function": {"name": "echo", "parameters": {}}}],
        context_window_tokens=100_000,
        draft_text="draft",
        mcp_tool_definitions=[],
        skills_text="",
        memory_text="",
    )
    ids = [c["id"] for c in data["categories"]]
    assert ids[-1] == "free"
    assert data["used_tokens"] + data["free_tokens"] == 100_000
    assert data["used_pct"] >= 0
    assert any(c["id"] == "system_tools" and c["tokens"] > 0 for c in data["categories"])
    assert any(c["id"] == "messages" and c["tokens"] > 0 for c in data["categories"])


def test_context_usage_api(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post("/api/sessions", headers=auth_headers, json={})
    sid = created.json()["id"]
    client.post(
        f"/api/sessions/{sid}/turns",
        headers=auth_headers,
        json={"content": "hello context"},
    )
    res = client.get(f"/api/sessions/{sid}/context-usage", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["context_window_tokens"] == 128000
    assert body["used_tokens"] > 0
    assert body["categories"][-1]["id"] == "free"
    assert "tokens_label" in body["categories"][0]

    with_draft = client.get(
        f"/api/sessions/{sid}/context-usage",
        headers=auth_headers,
        params={"draft": "x" * 400},
    )
    assert with_draft.json()["used_tokens"] >= body["used_tokens"]


def test_chat_page_has_context_usage_ui(client: TestClient) -> None:
    page = client.get("/ui/")
    assert page.status_code == 200
    assert "btnCtx" in page.text
    assert "Context window" in page.text
    assert "ctx-ring" in page.text
