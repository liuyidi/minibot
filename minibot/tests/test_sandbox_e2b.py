"""E2B sandbox backend tests (no network — Fake client)."""

from __future__ import annotations

import pytest

from minibot.sandbox.e2b_backend import E2BSandboxBackend


class FakeE2BSandbox:
    def __init__(self) -> None:
        self.commands_run: list[tuple[str, str]] = []
        self.killed = False

    @property
    def commands(self):
        outer = self

        class Commands:
            def run(self, cmd: str, cwd: str = "/home/user", timeout: float = 30.0):
                outer.commands_run.append((cmd, cwd))

                class R:
                    stdout = "ok-from-e2b"
                    stderr = ""
                    exit_code = 0

                return R()

        return Commands()

    def kill(self) -> None:
        self.killed = True


class FakeE2B:
    created: list[FakeE2BSandbox] = []

    @classmethod
    def create(cls, **kwargs):
        sb = FakeE2BSandbox()
        cls.created.append(sb)
        return sb


@pytest.mark.asyncio
async def test_e2b_reuses_sandbox_per_session() -> None:
    FakeE2B.created = []
    backend = E2BSandboxBackend(api_key="x", sandbox_cls=FakeE2B)
    await backend.run("echo 1", cwd="/home/user", timeout_s=10, session_id="sess-a")
    await backend.run("echo 2", cwd="/home/user", timeout_s=10, session_id="sess-a")
    assert len(FakeE2B.created) == 1
    await backend.run("echo 3", cwd="/home/user", timeout_s=10, session_id="sess-b")
    assert len(FakeE2B.created) == 2
    await backend.close_session("sess-a")
    assert FakeE2B.created[0].killed is True


@pytest.mark.asyncio
async def test_e2b_maps_host_cwd_to_default() -> None:
    FakeE2B.created = []
    backend = E2BSandboxBackend(api_key="x", sandbox_cls=FakeE2B)
    await backend.run(
        "pwd",
        cwd="/Users/me/.minibot/workspace",
        timeout_s=10,
        session_id="s",
    )
    assert FakeE2B.created[0].commands_run[0][1] == "/home/user"


@pytest.mark.asyncio
async def test_e2b_missing_key_errors_on_run(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MINIBOT_SERVER_EXEC_BACKEND", "e2b")
    # Override .env file values that may exist in the developer workspace.
    monkeypatch.setenv("MINIBOT_SERVER_E2B_API_KEY", "")
    monkeypatch.setenv("E2B_API_KEY", "")
    from minibot.config.settings import get_settings
    from minibot.sandbox.factory import build_sandbox_backend

    get_settings.cache_clear()
    backend = build_sandbox_backend(get_settings())
    with pytest.raises(RuntimeError, match="(?i)e2b|api.?key"):
        await backend.run("true", cwd="/", timeout_s=5, session_id="s")
    get_settings.cache_clear()
