"""Runtime paths for channel media under the minibot data dir."""

from __future__ import annotations

from pathlib import Path

from minibot.channels.helpers import ensure_dir

_data_dir: Path | None = None


def configure_channel_paths(data_dir: Path) -> None:
    global _data_dir
    _data_dir = Path(data_dir).expanduser()


def get_data_dir() -> Path:
    if _data_dir is not None:
        return ensure_dir(_data_dir)
    from minibot.config.settings import get_settings

    return ensure_dir(get_settings().data_dir.expanduser())


def get_media_dir(channel: str | None = None) -> Path:
    base = ensure_dir(get_data_dir() / "media")
    return ensure_dir(base / channel) if channel else base
