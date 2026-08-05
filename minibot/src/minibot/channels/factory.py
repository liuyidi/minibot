"""Build enabled IM channels from settings + persisted AppConfig."""

from __future__ import annotations

import logging
from typing import Any

from minibot.bus.queue import MessageBus
from minibot.channels.feishu_setup import FeishuPersistedConfig
from minibot.channels.manager import ChannelManager
from minibot.channels.paths import configure_channel_paths
from minibot.config.app_config import AppConfig
from minibot.config.settings import Settings

log = logging.getLogger("minibot.channels.factory")


def _parse_allow_from(raw: str) -> list[str]:
    text = (raw or "").strip()
    if not text or text == "*":
        return ["*"]
    return [part.strip() for part in text.split(",") if part.strip()] or ["*"]


def resolve_feishu_config(settings: Settings, config: AppConfig | None) -> FeishuPersistedConfig | None:
    """Prefer persisted QR/save config; fall back to env flags."""
    persisted = getattr(config, "feishu", None) if config is not None else None
    if isinstance(persisted, FeishuPersistedConfig) and persisted.app_id and persisted.app_secret:
        return persisted if persisted.enabled else None

    if not settings.feishu_enabled:
        return None
    app_id = settings.feishu_app_id.strip()
    app_secret = settings.feishu_app_secret.strip()
    if not app_id or not app_secret:
        return None
    return FeishuPersistedConfig(
        enabled=True,
        app_id=app_id,
        app_secret=app_secret,
        bot_name="minibot",
        domain="lark" if settings.feishu_domain.strip().lower() == "lark" else "feishu",
        dm_policy="open" if settings.feishu_allow_from.strip() == "*" else "allowlist",
        allow_from=_parse_allow_from(settings.feishu_allow_from),
        group_policy=(
            "open" if settings.feishu_group_policy.strip().lower() == "open" else "mention"
        ),
    )


def build_channel_manager(
    settings: Settings,
    bus: MessageBus,
    *,
    config: AppConfig | None = None,
) -> ChannelManager:
    configure_channel_paths(settings.data_dir)
    manager = ChannelManager(bus)

    feishu = resolve_feishu_config(settings, config)
    if feishu is not None:
        try:
            from minibot.channels.feishu import FeishuChannel, FeishuConfig
        except ImportError as exc:
            log.error("Feishu channel import failed: %s", exc)
            manager.last_error = f"feishu import: {exc}"
            return manager

        allow = list(feishu.allow_from) or (["*"] if feishu.dm_policy == "open" else [])
        cfg = FeishuConfig(
            enabled=True,
            app_id=feishu.app_id,
            app_secret=feishu.app_secret,
            allow_from=allow,
            domain=feishu.domain,
            group_policy=feishu.group_policy,
            streaming=False,
        )
        # Stash policy on channel for inbound pairing gate.
        channel = FeishuChannel(cfg, bus)
        channel.dm_policy = feishu.dm_policy  # type: ignore[attr-defined]
        manager.register(channel)
        log.info("Feishu channel registered app_id=%s dm_policy=%s", feishu.app_id, feishu.dm_policy)

    return manager


def auto_approve_channels_from_settings(
    settings: Settings,
    config: AppConfig | None = None,
) -> frozenset[str]:
    out: set[str] = set()
    feishu = resolve_feishu_config(settings, config)
    if feishu is not None and settings.feishu_auto_approve_tools:
        out.add("feishu")
    # Env-only enable still auto-approves when flag set.
    if settings.feishu_enabled and settings.feishu_auto_approve_tools:
        out.add("feishu")
    return frozenset(out)


def channel_status_payload(manager: ChannelManager | None) -> dict[str, Any]:
    if manager is None:
        return {"enabled": False, "channels": {}}
    return {"enabled": bool(manager.channels), **manager.status()}


async def reload_feishu_channel(state: Any) -> None:
    """Stop existing feishu channel (if any) and rebuild from current config."""
    import asyncio

    manager = getattr(state, "channels", None)
    if manager is None:
        state.channels = build_channel_manager(state.settings, state.bus, config=state.config)
        manager = state.channels
    else:
        existing = manager.channels.pop("feishu", None)
        if existing is not None:
            try:
                await existing.stop()
            except Exception:  # noqa: BLE001
                log.exception("stop feishu failed")

    feishu = resolve_feishu_config(state.settings, state.config)
    if feishu is None:
        return
    rebuilt = build_channel_manager(state.settings, state.bus, config=state.config)
    channel = rebuilt.channels.get("feishu")
    if channel is None:
        if rebuilt.last_error:
            manager.last_error = rebuilt.last_error
        return
    manager.register(channel)
    asyncio.create_task(channel.start(), name="feishu-channel-reload")