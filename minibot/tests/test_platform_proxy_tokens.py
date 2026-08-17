"""Tests for opaque desktop platform inference tokens."""

from __future__ import annotations

from pathlib import Path

from minibot.platform_proxy.tokens import (
    PLATFORM_TOKEN_AUD,
    PLATFORM_TOKEN_CLIENT,
    PlatformTokenStore,
)


def test_mint_and_validate(tmp_path: Path) -> None:
    store = PlatformTokenStore(tmp_path)
    token, ttl = store.mint(user_id="user-1", ttl_s=3600)
    assert ttl == 3600
    assert token
    claims = store.validate(token)
    assert claims is not None
    assert claims.user_id == "user-1"
    assert claims.aud == PLATFORM_TOKEN_AUD
    assert claims.client == PLATFORM_TOKEN_CLIENT


def test_reject_garbage(tmp_path: Path) -> None:
    store = PlatformTokenStore(tmp_path)
    assert store.validate("") is None
    assert store.validate("not-a-real-token") is None


def test_expiry(tmp_path: Path, monkeypatch) -> None:
    store = PlatformTokenStore(tmp_path)
    now = 1_700_000_000
    monkeypatch.setattr("minibot.platform_proxy.tokens.time.time", lambda: now)
    token, _ = store.mint(user_id="user-1", ttl_s=60)
    assert store.validate(token) is not None
    monkeypatch.setattr("minibot.platform_proxy.tokens.time.time", lambda: now + 120)
    assert store.validate(token) is None


def test_persist_across_instances(tmp_path: Path) -> None:
    store = PlatformTokenStore(tmp_path)
    token, _ = store.mint(user_id="user-2", ttl_s=3600)
    store2 = PlatformTokenStore(tmp_path)
    claims = store2.validate(token)
    assert claims is not None
    assert claims.user_id == "user-2"
