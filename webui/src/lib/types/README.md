# `lib/types`

Shared TypeScript DTOs for the WebUI. Import via `@/lib/types` (barrel in `index.ts`).

This README currently documents **streaming / turn lifecycle** only — mainly [`InboundEvent`](./protocol.ts).

## Streaming message state points (`InboundEvent`)

Gateway → WebUI frames over the multiplex WebSocket. Primary consumer: `hooks/useMinibotStream.ts`.

Many turn-scoped frames also carry optional [`InboundTurnMetadata`](./protocol.ts):

| Field | Meaning |
|-------|---------|
| `turn_id` | Stable id for one user→assistant turn |
| `turn_phase` | See `UITurnPhase` in [`message.ts`](./message.ts): `user` \| `reasoning` \| `activity` \| `answer` \| `complete` |
| `turn_seq` | Ordering within the turn |

### Typical assistant-turn flow

```text
goal_status: running
    │
    ├─ reasoning_delta* ──► reasoning_end     (optional thinking channel)
    │
    ├─ message(kind=tool_hint|progress)*      (activity / breadcrumbs)
    ├─ file_edit*                             (structured edit cards)
    │
    ├─ delta* ──► stream_end                  (answer token stream)
    │      or
    ├─ message (final conversational text)    (non-stream / finalize path)
    │
    ├─ agent_trace?                           (Langfuse / tools_used)
    └─ turn_end  (+ optional goal_state)
goal_status: idle
```

HITL pause (when present) inserts `approval_required` and `goal_status: waiting_approval` before the turn continues.

### Event catalog

| `event` | Role in the stream |
|---------|--------------------|
| `ready` | Socket handshake; client bound (`client_id`, `chat_id`) |
| `attached` | Bound to a chat after `attach` / `new_chat` |
| `goal_status` | Turn machine: `running` \| `idle` \| `waiting_approval` (`started_at` when running) |
| `goal_state` | Sustained-goal snapshot for the chat |
| `reasoning_delta` | Incremental thinking / reasoning text |
| `reasoning_end` | Reasoning channel closed for this stream |
| `delta` | Incremental assistant answer tokens |
| `stream_end` | Answer stream closed (`text` may be final snapshot) |
| `message` | Discrete assistant/user frame. With `kind?: tool_hint \| progress \| reasoning` → activity breadcrumb; without → conversational content. May include `tool_events`, `media_urls`, `latency_ms`, `source`, `agent_ui` |
| `file_edit` | Structured file-edit activity (`edits: UIFileEdit[]`) |
| `approval_required` | HITL pause; payload `approval: PendingApproval` |
| `agent_trace` | Post-turn observability (`langfuse_trace_id`, `tools_used`, `stop_reason`) |
| `turn_end` | Turn finished; wall `latency_ms`; may embed authoritative `goal_state` |
| `session_updated` | Session metadata / thread / workspace scope changed |
| `runtime_model_updated` | Live model / preset changed (settings apply) |
| `transcription_result` / `transcription_error` | Voice STT request completion |
| `error` | Transport or turn error (`detail` / `reason`) |

### Related types

- [`UIMessage`](./message.ts) — UI thread rows built from the events above (`kind: message \| trace`, `reasoning`, `toolEvents`, `fileEdits`, …)
- [`Outbound`](./protocol.ts) — client → gateway (`message`, `attach`, `approval_response`, …); not the focus of this note
- [`ConnectionStatus`](./protocol.ts) — socket lifecycle (`idle` → `connecting` → `open` / `reconnecting` / …), separate from turn `goal_status`

---

# 中文说明

WebUI 共享 TypeScript DTO。请通过 `@/lib/types`（`index.ts` barrel）引入。

本文目前只记录 **流式 / 一轮对话生命周期**，核心类型是 [`InboundEvent`](./protocol.ts)。

## 流式消息状态点（`InboundEvent`）

网关经 multiplex WebSocket 推给 WebUI 的帧。主要消费方：`hooks/useMinibotStream.ts`。

多数「本轮」相关帧还可带可选的 [`InboundTurnMetadata`](./protocol.ts)：

| 字段 | 含义 |
|------|------|
| `turn_id` | 一次 user→assistant 轮次的稳定 id |
| `turn_phase` | 见 [`message.ts`](./message.ts) 的 `UITurnPhase`：`user` \| `reasoning` \| `activity` \| `answer` \| `complete` |
| `turn_seq` | 同一轮内的顺序号 |

### 典型助手轮次流程

```text
goal_status: running
    │
    ├─ reasoning_delta* ──► reasoning_end     （可选 thinking 通道）
    │
    ├─ message(kind=tool_hint|progress)*      （活动 / 面包屑）
    ├─ file_edit*                             （结构化编辑卡片）
    │
    ├─ delta* ──► stream_end                  （答案 token 流）
    │      或
    ├─ message（最终对话正文）                 （非流式 / 收口路径）
    │
    ├─ agent_trace?                           （Langfuse / tools_used）
    └─ turn_end  （可带 goal_state）
goal_status: idle
```

若有 HITL 审批，会在轮次继续前插入 `approval_required`，并把 `goal_status` 置为 `waiting_approval`。

### 事件一览

| `event` | 在流中的作用 |
|---------|--------------|
| `ready` | Socket 握手；客户端已绑定（`client_id`、`chat_id`） |
| `attached` | `attach` / `new_chat` 后绑定到某个会话 |
| `goal_status` | 轮次状态机：`running` \| `idle` \| `waiting_approval`（`running` 时有 `started_at`） |
| `goal_state` | 该会话的 sustained-goal 快照 |
| `reasoning_delta` | 增量 thinking / reasoning 文本 |
| `reasoning_end` | 本流 reasoning 通道结束 |
| `delta` | 助手答案增量 token |
| `stream_end` | 答案流结束（`text` 可能是最终全文快照） |
| `message` | 离散的助手/用户帧。带 `kind?: tool_hint \| progress \| reasoning` → 活动面包屑；无 `kind` → 对话正文。可含 `tool_events`、`media_urls`、`latency_ms`、`source`、`agent_ui` |
| `file_edit` | 结构化文件编辑活动（`edits: UIFileEdit[]`） |
| `approval_required` | HITL 暂停；载荷 `approval: PendingApproval` |
| `agent_trace` | 轮次后可观测性（`langfuse_trace_id`、`tools_used`、`stop_reason`） |
| `turn_end` | 轮次结束；墙钟 `latency_ms`；可嵌入权威 `goal_state` |
| `session_updated` | 会话元数据 / thread / workspace scope 变更 |
| `runtime_model_updated` | 运行中模型 / preset 变更（设置生效） |
| `transcription_result` / `transcription_error` | 语音 STT 请求完成 |
| `error` | 传输或轮次错误（`detail` / `reason`） |

### 相关类型

- [`UIMessage`](./message.ts) — 由上述事件拼出的 UI 会话行（`kind: message \| trace`、`reasoning`、`toolEvents`、`fileEdits` 等）
- [`Outbound`](./protocol.ts) — 客户端 → 网关（`message`、`attach`、`approval_response` 等）；本文不展开
- [`ConnectionStatus`](./protocol.ts) — Socket 连接生命周期（`idle` → `connecting` → `open` / `reconnecting` / …），与轮次的 `goal_status` 不是同一套状态
