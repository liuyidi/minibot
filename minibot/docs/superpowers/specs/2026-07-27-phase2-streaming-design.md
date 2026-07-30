# Phase 2 — Streaming + Reasoning（Design）

**日期：** 2026-07-27  
**状态：** 待评审  
**范围：** 完整 Phase 2 合同（方案 1：Bus 中心事件）  
**短计划：** [`docs-plan/phase-2-streaming.md`](../../../../docs-plan/phase-2-streaming.md)

## 目标

Chat 默认流式（UX-11）、reasoning 折叠（UX-12）、Stop、WS 事件对齐 nanobot `docs/websocket.md`；provider 留下 `chat_stream` 扩展点。

## 非目标

- Anthropic / 多 backend registry（Phase 6 余量）
- Phase 2.5 async spawn
- 断线后增量续传（只做 flush + 重连拉完整消息）
- REST turn 强制流式（REST 仍可整包；流式主路径 = WS）

## 架构（方案 1）

```text
WS message
  → bus inbound
  → BusWorker / Loop.handle_turn(stream=True)
  → Runner.run_stream
  → Provider.chat_stream  (SSE)
  → Loop 合并 delta → OutboundMessage(kind=…)
  → BusWorker.deliver_outbound
  → hub.send(event=delta|reasoning_delta|…)
```

高频 token 在 **Loop 侧合并**（约 50ms 或 ≥32 字符）再入 Bus，避免每 token 一次 enqueue。

## Provider 合同

```python
# StreamEvent 联合（dataclass / TypedDict 均可）
TextDelta(text: str)
ReasoningDelta(text: str)
ToolCallDelta(id: str, name: str, arguments_delta: str)  # 可选增量；也可 StreamEnd 带完整 tool_calls
UsageEnd(usage: dict)
StreamEnd(finish_reason: str, content: str | None, tool_calls: list[ToolCallRequest], reasoning: str | None)
```

- `LLMProvider.chat_stream(...) -> AsyncIterator[StreamEvent]`
- 现有 `chat()` **保留**：默认实现可消费 `chat_stream` 并聚合为 `LLMResponse`（向后兼容 FakeProvider / 测试）
- OpenAI-compat：`stream=true` SSE；解析 `delta.content`、`delta.reasoning_content` / `delta.reasoning` / 部分网关的 `delta.thinking`；tool_calls 增量拼接

## Runner 合同

- 新增 `run_stream(...) -> AsyncIterator[RunnerEvent]`
  - 对外可再映射：`text_delta` / `reasoning_delta` / `tool_call_start` / `tool_result` / `llm_stream_end` / `done` / `error`
- ReAct：每一轮 LLM 一次 `chat_stream`；若 `StreamEnd` 带 tool_calls → 发 `tool_call_start` → 执行工具 → `tool_result` → 下一轮新 `stream_id`
- 现有 `run()`：内部可委托 `run_stream` 聚合，或保持独立路径但共享 prepare/trace 辅助；**不得破坏**现有 REST/cron 整包行为
- Trace：流式过程追加轻量 step（`delta` 可抽样或不入完整字符）；结束仍有 `llm_final` / `done`

## Loop / Bus

出站 `OutboundMessage.metadata.kind`：

| kind | content / meta | 对应 WS event |
|------|----------------|---------------|
| `delta` | text chunk；`stream_id` | `delta` |
| `reasoning_delta` | text；`stream_id` | `reasoning_delta` |
| `reasoning_end` | `stream_id` | `reasoning_end` |
| `tool_call_start` | name / args 摘要 | `message` kind=tool_hint 或专用 event（MVP 用 tool_hint 兼容） |
| `tool_result` | name + preview | 同上 / Trace |
| `stream_end` | `stream_id` | `stream_end` |
| `turn_ok` | 完整 text + trace（兼容旧客户端） | `message` + `agent_trace` |
| `turn_end` | — | `turn_end` |
| `error` / `turn_error` | detail | `error` |
| `stream_aborted` | — | `error` detail=aborted + `turn_end` |

**落库：** 仅在 turn 结束写入完整 user/assistant（+ tool）消息；流式过程不写半包。

## Stop（UX-01）

- 客户端：`{"type":"abort","chat_id":"..."}`（或 `stop`）
- `AgentLoop` 每 session 一个 `asyncio.Event` / `CancelToken`；`handle_turn` 在 stream 循环检查；取消 → `CancelledError` → `stream_aborted`
- Provider httpx 流用 `aclose()` 尽量掐断上游

## 断线（2.6）

- 出站合并缓冲在 detach 前 **flush** 一次
- 不做未发送 delta 的持久续传
- 重连 `attach` 后客户端 `GET /messages` 拉完整轮次（Chat 已有 refresh）

## Dev UI

**正常**
- Chat：流式气泡 + 光标；reasoning 默认折叠，可展开；Stop 按钮在 running 时可用
- Trace：`agent_trace` 仍在 turn 末；可选实时 `delta` 计数（字符数 / streaming|idle）

**异常**
- 上游 SSE 中断 → `error` + 半包气泡标记「已中断」+ 可刷新消息
- 无 reasoning → 不渲染折叠区
- Stop → 立即 idle，不卡 goal_status
- FakeProvider 慢流 / 抛错 path 可在 `/api/dev` 或单测覆盖

## 测试

- Provider：SSE fixture 解析 content + reasoning + tool_calls
- Runner：`run_stream` 文本-only；tool 打断再续流
- WS/API：TestClient + 收集 outbound kinds 顺序
- UI：手工 Chat 演示（正常流 / Stop / 无 reasoning）

## 验收对照迁移计划

- [ ] Dev UI 逐 token
- [ ] reasoning 独立通道（有则显示）
- [ ] Stop 可用
- [ ] 整包 `message` 仍发（旧客户端）
- [ ] 断线重连后 messages 完整
- [ ] `pytest` 相关用例绿
