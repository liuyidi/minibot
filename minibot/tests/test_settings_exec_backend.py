"""Settings for exec sandbox backend."""

from minibot.config.settings import get_settings


def test_exec_backend_from_env(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("MINIBOT_SERVER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MINIBOT_SERVER_EXEC_BACKEND", "e2b")
    monkeypatch.setenv("MINIBOT_SERVER_E2B_API_KEY", "e2b_test")
    get_settings.cache_clear()
    s = get_settings()
    assert s.exec_backend == "e2b"
    assert s.normalized_exec_backend() == "e2b"
    assert s.resolved_e2b_api_key() == "e2b_test"
    get_settings.cache_clear()
