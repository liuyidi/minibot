# Phase 2 — Streaming Implementation Plan

> **For agentic workers:** Implement task-by-task; checkbox steps. Spec: `minibot/docs/superpowers/specs/2026-07-27-phase2-streaming-design.md`

**Goal:** Full Phase 2 contract — Bus-centric streaming deltas, reasoning channel, Stop, Chat UX-11/12.

**Architecture:** `Provider.chat_stream` → `Runner.run_stream` → Loop coalesces events into `OutboundMessage` → existing BusWorker/`deliver_outbound` maps to nanobot-compatible WS events (`delta`, `reasoning_*`, `stream_end`, plus legacy `message`/`turn_end`).

**Tech Stack:** FastAPI WS, httpx SSE, asyncio CancelToken, Dev UI static HTML/JS.

**Status:** ✅ 已实现（2026-07-27）；`pytest tests/test_streaming_phase2.py` 9/9 绿；全量 127 passed。

## Global Constraints

- Align WS event names with `docs/websocket.md` (`delta`, `stream_end`, `reasoning_delta`, `reasoning_end`).
- Keep `chat()` / `run()` / REST / cron whole-message paths working.
- Session JSONL stores only completed turns (no partial assistant rows).
- Coalesce deltas (~50ms or ≥32 chars) before bus publish.
- No Anthropic native provider; no incremental reconnect resume; no Phase 2.5.

---

## File map

| File | Role |
|------|------|
| `minibot/providers/base.py` | `StreamEvent` types + `chat_stream` ABC |
| `minibot/providers/openai_compat.py` | SSE parse |
| `minibot/tests/fake_provider.py` | streaming FakeProvider |
| `minibot/agent/runner.py` | `run_stream` |
| `minibot/agent/loop.py` | stream turn + cancel token + coalesce publish |
| `minibot/agent/stream_coalesce.py` | delta coalescing |
| `minibot/bus/worker.py` | (minimal) entry already ok |
| `minibot/api/ws.py` | map kinds → WS; handle `abort` |
| `minibot/static/devui/index.html` | UX-11/12 + Stop |
| `minibot/static/devui/trace.html` | optional live hint |
| `tests/test_streaming_phase2.py` | core tests |
| `docs/websocket.md` or minibot note | minibot deviations if any |

---

### Task 1: Provider stream types + OpenAI SSE + FakeProvider

**Files:** `providers/base.py`, `openai_compat.py`, `tests/fake_provider.py`, `tests/test_streaming_phase2.py`

- [x] Add `StreamEvent` dataclasses + `chat_stream` on `LLMProvider`
- [x] Implement OpenAI-compat `stream=True` line parser
- [x] Extend `FakeProvider` with `streaming_text` / reasoning chunks
- [x] Tests: parse fixture SSE; FakeProvider yields deltas then StreamEnd

### Task 2: Runner.run_stream

**Files:** `agent/runner.py`, tests

- [x] `run_stream` yields runner events; tool round breaks stream and continues
- [x] `run()` stays green (delegates to `run_stream` + aggregate)
- [x] Tests: text-only stream aggregate

### Task 3: Loop coalesce + cancel + bus publish

**Files:** `agent/loop.py`, `bus/worker.py` (if needed), tests

- [x] `handle_turn` streams when `entry=ws|cron` (or explicit `stream=True`)
- [x] Coalesce + publish outbound kinds per design table
- [x] Session cancel token; abort mid-stream
- [x] Persist full messages only at end
- [x] Tests: outbound kind sequence; abort sets `aborted`

### Task 4: WS deliver + abort envelope

**Files:** `api/ws.py`, tests

- [x] `deliver_outbound` branches for delta / reasoning_* / stream_end; keep turn_ok → message+trace
- [x] Inbound `type: abort|stop`
- [x] Tests: kind→event mapping

### Task 5: Dev UI UX-11 / UX-12 / Stop

**Files:** `static/devui/index.html` (+ small CSS/JS)

- [x] Streaming bubble + cursor; append deltas
- [x] Reasoning fold (hide if never received)
- [x] Stop button → abort frame
- [x] On `turn_end` / error: refresh timeline; clear streaming state

### Task 6: Docs + checklist

**Files:** `docs-plan/minibot-fastapi-migration.md`, this file status

- [x] Mark Phase 2 done in checklist
- [x] `pytest tests/test_streaming_phase2.py` + full suite green

---

## Manual DoD

**正常：** Chat 发短问题 → 逐字出现 →（若模型有 thinking）折叠区有内容 → turn_end 后时间线与落库一致。  
**异常：** Stop 中途停下；断 WS 再 attach + 刷 messages 仍完整；无 reasoning 模型无折叠占位。
