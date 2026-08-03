# Human-in-the-loop（HITL）审批

> 状态：**已实现**（2026-08-03）；范围：高风险工具调用的暂停、持久化审批、REST / WebSocket 恢复，以及 Dev UI 与正式 WebUI 的审批卡片。

HITL 的目标不是让模型在文本里写出“请确认”，而是让运行时在执行有副作用的动作前暂停，等待用户作出可信、可审计的决定。

```text
LLM native tool call
        ↓
ApprovalPolicy（风险与工具策略）
        ↓
PendingApproval 落盘（可重启恢复）
        ↓
approval_required 结构化事件
        ↓
WebUI / Dev UI 的预注册 ApprovalCard
        ↓
approve / reject → 继续执行或返回拒绝结果
```

## 1. 默认策略与状态

`ApprovalPolicy` 默认要求人工确认以下调用：

- `exec`、`write_file`、`edit_file`、`write_memory`；
- 所有 MCP 工具；
- 任意工具可通过 `approval_mode="always"` 显式要求确认。

一次审批的公开字段如下：

```json
{
  "id": "apr_...",
  "session_id": "...",
  "tool_calls": [{"id": "call_...", "name": "write_file", "arguments": {}}],
  "reason": "write_file may modify local state or invoke an external capability.",
  "risk": "high",
  "created_at_ms": 0,
  "expires_at_ms": 0,
  "status": "pending"
}
```

待审批记录存为 `{data_dir}/approvals/apr_*.json`（通常为
`~/.minibot/approvals/`）。文件以写临时文件、`fsync`、原子替换方式持久化；默认 15 分钟过期。审批状态可为 `pending`、`approved`、`rejected` 或 `expired`。

## 2. 客户端合同

### WebSocket

服务端会推送：

```json
{"event":"approval_required","chat_id":"websocket:...","approval":{}}
```

随后推送 `goal_status: "waiting_approval"`。客户端提交：

```json
{"action":"approval_response","approval_id":"apr_...","decision":"approve"}
```

`decision` 也可以为 `reject`。批准后，保留的 LLM 上下文与工具调用继续执行；拒绝后，Agent 获得工具被拒绝的结果并可继续完成回合。最终仍以 `turn_end` 标记整回合结束。

### REST

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/approvals?session_id=&pending_only=true` | 查询审批队列；适合刷新、重连恢复 |
| `POST` | `/api/approvals/{approval_id}/resolve` | Body：`{"decision":"approve"}` 或 `{"decision":"reject"}` |
| `POST` | `/api/sessions/{id}/turns` | 同步回合若暂停，响应包含 `approval_id` 与 `approval` |

所有端点均需要正常的 Bearer 鉴权。重复、已处理或过期的审批会得到冲突错误，而不是再次执行工具。

## 3. 为什么卡片不是 LLM 文本

WebUI 使用**结构化事件流**，并不解析模型正文里的 `{tag: "card"}`。`delta` 只累积聊天文本；`approval_required` 则更新 `pendingApproval` 状态，并由 React 条件渲染 `ApprovalCard`。工具提示、文件编辑、推理流也遵循相同的“事件 → 状态 → 组件”路径。

这使得审批的工具名、参数、风险、过期时间和按钮动作均来自后端权威状态。模型只提出原生 tool call，不能伪造批准按钮、金额或执行结果。

适合让模型编排的开放式报告/仪表盘，可在未来另加受 JSON Schema 与组件白名单约束的 `agent_ui` 事件；审批、支付、文件写入等安全动作必须继续使用本机制。

## 4. 界面与验证

- Dev UI：[`/ui/`](http://127.0.0.1:8766/ui/) 聊天页与 [`/ui/approvals.html`](http://127.0.0.1:8766/ui/approvals.html) 队列/流程模拟器。
- 正式 WebUI：Composer 上方展示审批卡，参数区域自动换行并限制为正文最大宽度；页面刷新后通过 REST 队列恢复待审批状态。
- 后端单测：`cd minibot && .venv/bin/pytest tests/test_hitl.py -q`。

实现入口：`agent/approval.py`、`agent/runner.py`、`agent/loop.py`、`api/routes/approvals.py` 与 `api/ws.py`。
