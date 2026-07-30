"""Educational race demo: same-session concurrent turns with/without lock.

Uses a simulated agent (``asyncio.sleep``) so the demo works offline and the
race window is deterministic. Real LLM latency opens the same window.
"""

from __future__ import annotations

import asyncio
from typing import Any, Literal

from minibot.agent.loop import AgentLoop
from minibot.session.store import SessionStore

Mode = Literal["unsafe", "safe"]


async def _simulate_agent(label: str, work_s: float) -> str:
    await asyncio.sleep(work_s)
    return f"[simulated] reply to {label}"


def _diagnose(messages: list[dict[str, Any]], *, expected_users: int) -> dict[str, Any]:
    users = [m for m in messages if m.get("role") == "user"]
    assistants = [m for m in messages if m.get("role") == "assistant"]
    problems: list[str] = []
    if len(users) < expected_users:
        problems.append(
            f"lost_update: 期望 {expected_users} 条 user，实际只有 {len(users)} —— 后写覆盖了先写"
        )
    if len(users) != len(assistants):
        problems.append(
            f"pair_mismatch: user={len(users)} assistant={len(assistants)}（对话对不齐）"
        )
    labels = [str(m.get("content") or "") for m in users]
    missing = [f"MSG-{i}" for i in range(expected_users) if not any(f"MSG-{i}" in x for x in labels)]
    if missing:
        problems.append(f"missing_labels: {', '.join(missing)}")
    verdict = "CORRUPTED" if problems else "OK"
    return {
        "verdict": verdict,
        "expected_user_turns": expected_users,
        "actual_user_turns": len(users),
        "actual_assistant_turns": len(assistants),
        "problems": problems,
    }


async def run_session_race(
    *,
    store: SessionStore,
    loop: AgentLoop | None,
    mode: Mode,
    concurrency: int = 2,
    snapshot_delay_s: float = 0.12,
    work_s: float = 0.05,
) -> dict[str, Any]:
    """Run N concurrent simulated turns on one fresh session.

    * **unsafe**: read stale snapshot → sleep → ``replace_messages``（典型 lost update）
    * **safe**: 持有 ``AgentLoop.session_lock`` 后再读历史并追加
    """
    if concurrency < 2:
        concurrency = 2
    if mode == "safe" and loop is None:
        raise ValueError("safe mode requires AgentLoop")

    session = store.create(title=f"race-{mode}")
    session_id = session.id
    labels = [f"MSG-{i} ({'无锁' if mode == 'unsafe' else '有锁'})" for i in range(concurrency)]

    async def unsafe_one(label: str) -> None:
        current = store.get(session_id)
        assert current is not None
        # Stale snapshot — both coroutines typically see the same empty history.
        stale = list(current.messages)
        await asyncio.sleep(snapshot_delay_s)
        reply = await _simulate_agent(label, work_s)
        # Lost update: write from stale base, stomping concurrent writers.
        store.replace_messages(
            session_id,
            [
                *stale,
                {"role": "user", "content": label},
                {"role": "assistant", "content": reply},
            ],
        )

    async def safe_one(label: str) -> None:
        assert loop is not None
        async with loop.session_lock(session_id):
            current = store.get(session_id)
            assert current is not None
            base = list(current.messages)
            await asyncio.sleep(snapshot_delay_s)
            reply = await _simulate_agent(label, work_s)
            store.replace_messages(
                session_id,
                [
                    *base,
                    {"role": "user", "content": label},
                    {"role": "assistant", "content": reply},
                ],
            )

    worker = unsafe_one if mode == "unsafe" else safe_one
    await asyncio.gather(*[worker(label) for label in labels])

    final = store.get(session_id)
    messages = list(final.messages) if final else []
    diagnosis = _diagnose(messages, expected_users=concurrency)
    return {
        "mode": mode,
        "session_id": session_id,
        "concurrency": concurrency,
        "labels": labels,
        "messages": messages,
        **diagnosis,
        "explain": (
            "无锁：各协程先拍快照再写回，后写覆盖先写 → 消息丢失。"
            if mode == "unsafe"
            else "有锁：同一 session 串行，每人读到最新历史再追加 → 完整保留。"
        ),
    }
