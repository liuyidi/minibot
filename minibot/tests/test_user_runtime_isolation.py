"""User runtime isolation tests."""

from __future__ import annotations

from pathlib import Path

from minibot.bus.queue import MessageBus
from minibot.config.settings import Settings
from minibot.sandbox.factory import build_sandbox_backend
from minibot.user_runtime import build_user_runtime, resolve_user_root


def test_user_runtime_uses_distinct_roots(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    bus = MessageBus()
    backend = build_sandbox_backend(settings)

    alpha = build_user_runtime(settings=settings, bus=bus, sandbox_backend=backend, user_id="user-alpha")
    beta = build_user_runtime(settings=settings, bus=bus, sandbox_backend=backend, user_id="user-beta")

    assert alpha.root == resolve_user_root(settings, "user-alpha")
    assert beta.root == resolve_user_root(settings, "user-beta")
    assert alpha.root != beta.root

    a_session = alpha.sessions.create(title="alpha-only")
    assert alpha.sessions.get(a_session.id) is not None
    assert beta.sessions.get(a_session.id) is None

    alpha.save_config()
    beta.save_config()
    assert (alpha.root / "config.json").exists()
    assert (beta.root / "config.json").exists()
