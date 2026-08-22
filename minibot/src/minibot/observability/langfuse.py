"""Thin mini-langfuse adapter.

Soft-imports ``mini_langfuse``. When disabled or SDK missing, all helpers are no-ops
so Dev UI / agent paths stay unchanged.

Phase B: Trace / Generation / Tool spans.
Phase C: Prompt versioning (``minibot-system``) + Score API helpers.
"""

from __future__ import annotations

import hashlib
import logging
from contextlib import contextmanager
from typing import Any, Iterator

log = logging.getLogger("minibot.observability.langfuse")

SYSTEM_PROMPT_NAME = "minibot-system"

_client: Any | None = None
_enabled: bool = False
# content sha256 → prompt_version_id
_prompt_id_cache: dict[str, str] = {}


class _NullSpan:
    def update(self, **_fields: Any) -> None:
        return None

    def end(self, **_fields: Any) -> None:
        return None

    @property
    def id(self) -> str:
        return ""

    @property
    def trace_id(self) -> str:
        return ""


class _NullTrace:
    def update(self, **_fields: Any) -> None:
        return None

    @property
    def id(self) -> str:
        return ""


def is_enabled() -> bool:
    return _enabled and _client is not None


def init_from_settings(settings: Any) -> None:
    """Create Client when ``langfuse_enabled`` and keys are set."""
    global _client, _enabled
    shutdown()

    enabled = bool(getattr(settings, "langfuse_enabled", False))
    if not enabled:
        _enabled = False
        return

    public_key = (getattr(settings, "langfuse_public_key", "") or "").strip()
    secret_key = (getattr(settings, "langfuse_secret_key", "") or "").strip()
    host = (getattr(settings, "langfuse_host", "") or "http://localhost:8000").strip()
    if not public_key or not secret_key:
        log.warning("langfuse enabled but keys missing; skipping init")
        _enabled = False
        return

    try:
        from mini_langfuse import Client
    except ImportError:
        log.warning(
            "mini_langfuse not installed — run: pip install -e <mini-langfuse>/sdk-python"
        )
        _enabled = False
        return

    _client = Client(public_key, secret_key, host=host, make_default=True)
    _enabled = True
    log.info("mini-langfuse client ready host=%s", host)


def shutdown() -> None:
    global _client, _enabled
    if _client is not None:
        try:
            _client.flush(timeout=2.0)
            _client.close()
        except Exception as exc:  # noqa: BLE001 — best-effort shutdown
            log.debug("langfuse shutdown: %s", exc)
    _client = None
    _enabled = False
    _prompt_id_cache.clear()
    try:
        from mini_langfuse import Client

        Client._default = None
    except ImportError:
        pass


def ensure_system_prompt(
    content: str,
    *,
    name: str = SYSTEM_PROMPT_NAME,
) -> str | None:
    """Sync identity text to Langfuse as a versioned prompt; return version id.

    Only versions the stable identity template (not the full assembled system
    prompt with SOUL/skills/memory). Content-hash cached in-process.
    """
    if not is_enabled() or not (content or "").strip():
        return None
    assert _client is not None

    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    cached = _prompt_id_cache.get(digest)
    if cached:
        return cached

    try:
        existing = _client.get_prompt(name, label="production")
        if existing.raw_content == content:
            _prompt_id_cache[digest] = existing.id
            return existing.id
    except Exception:  # noqa: BLE001 — missing prompt / network → create
        pass

    try:
        created = _client.create_prompt(
            name=name,
            type="text",
            content=content,
            labels=["production"],
            commit_message="minibot identity sync",
            created_by="minibot",
        )
        pid = created.get("id") if isinstance(created, dict) else None
        if isinstance(pid, str) and pid:
            _prompt_id_cache[digest] = pid
            log.info("langfuse prompt %s → version id=%s", name, pid)
            return pid
    except Exception as exc:  # noqa: BLE001
        log.warning("ensure_system_prompt failed: %s", exc)
    return None


def score(
    *,
    trace_id: str,
    name: str = "user-feedback",
    value: float | None = None,
    string_value: str | None = None,
    data_type: str = "BOOLEAN",
    comment: str | None = None,
    observation_id: str | None = None,
    source: str = "API",
) -> dict[str, Any] | None:
    """Post a score for a trace. Returns server JSON or None if disabled/error."""
    if not is_enabled() or not trace_id:
        return None
    assert _client is not None
    try:
        return _client.score(
            name=name,
            trace_id=trace_id,
            value=value,
            string_value=string_value,
            data_type=data_type,
            observation_id=observation_id,
            source=source,
            comment=comment,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("langfuse score failed: %s", exc)
        return None


@contextmanager
def turn_trace(
    *,
    name: str = "agent-turn",
    session_id: str | None = None,
    user_id: str | None = None,
    input: Any = None,
    metadata: Any = None,
    tags: list[str] | None = None,
) -> Iterator[Any]:
    """Open one Trace for a handle_turn (or no-op)."""
    if not is_enabled():
        yield _NullTrace()
        return
    assert _client is not None
    with _client.trace(
        name=name,
        session_id=session_id,
        user_id=user_id,
        input=input,
        metadata=metadata,
        tags=tags,
    ) as tr:
        yield tr


@contextmanager
def observation(
    *,
    as_type: str = "span",
    name: str | None = None,
    model: str | None = None,
    input: Any = None,
    metadata: Any = None,
    model_parameters: Any = None,
    prompt_version_id: str | None = None,
) -> Iterator[Any]:
    """Attach a Span/Generation to the current Trace (or no-op / orphan-safe skip)."""
    if not is_enabled():
        yield _NullSpan()
        return
    assert _client is not None

    try:
        from mini_langfuse import context
        from mini_langfuse.client import _Trace
    except ImportError:
        yield _NullSpan()
        return

    trace_id = context.current_trace_id.get()
    if not trace_id:
        # Outside handle_turn — avoid accidental auto-traces from runner-only paths.
        yield _NullSpan()
        return

    tr = _Trace(_client, trace_id)
    if as_type == "generation":
        cm = tr.generation(
            name=name,
            model=model,
            input=input,
            metadata=metadata,
            model_parameters=model_parameters,
            prompt_version_id=prompt_version_id,
        )
    else:
        cm = tr.span(name=name, input=input, metadata=metadata)

    with cm as span:
        yield span


def usage_dict(usage: dict[str, Any] | None) -> dict[str, Any] | None:
    if not usage:
        return None
    out: dict[str, Any] = {}
    for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
        if key in usage and usage[key] is not None:
            out[key] = usage[key]
    return out or None


def observability_public_payload(settings: Any) -> dict[str, Any]:
    """Safe-for-UI snapshot (no secrets)."""
    return {
        "langfuse_enabled": bool(getattr(settings, "langfuse_enabled", False)) and is_enabled(),
        "langfuse_host": (getattr(settings, "langfuse_host", "") or "").rstrip("/"),
        "langfuse_configured": bool(
            (getattr(settings, "langfuse_public_key", "") or "").strip()
            and (getattr(settings, "langfuse_secret_key", "") or "").strip()
        ),
    }
