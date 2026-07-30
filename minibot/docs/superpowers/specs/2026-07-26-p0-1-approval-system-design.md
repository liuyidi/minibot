# P0-1 · Approval System (Design)

> 2026-07-26 · 对齐 `chengxiaobang/apps/backend/src/tools/approval-policy.ts` + `agent/approval-queue.ts` + `agent/smart-approval.ts`

## 1. 目标

给 minibot 加"人工审批 + 智能审批"双层门控：mutating 工具（shell、fs 写/编辑、web fetch 高风险、MCP 未信任 server 等）先进 `pending_approval` 状态，UI/CLI 决定放行或拒绝；智能审批在中间用小模型判断是否值得打扰用户。

## 2. 状态机

```
pending_approval → running → completed
              ↘        ↘   ↘
              rejected    failed
```

- pending_approval：工具即将执行，写库并广播事件；调用方 await `ApprovalQueue.wait()`
- rejected：把拒绝作为 tool_result 喂回模型；run 继续
- 其他状态同现有 runner

## 3. 数据模型

新增表/字段（依赖 P0-3 完成后落 sqlite；先阶段用 `~/.minibot/data/approvals.jsonl` 也可）：

```python
class ApprovalRecord(BaseModel):
    tool_call_id: str
    session_id: str
    run_id: str
    tool_name: str
    args_preview: str
    reason: str            # 触发审批的原因（policy 命中）
    status: Literal["pending", "approved", "rejected", "expired"]
    created_at: str
    resolved_at: str | None
    smart: bool            # 是否是 smart-approval 自动结论
    smart_confidence: float | None
```

## 4. Policy 层

`security/approval_policy.py`：

- `evaluate(tool_call) -> ApprovalDecision`：`allow` / `require_human` / `deny_hard`
- 规则来源：
  1. 内置规则表（`shell.exec` 默认 `require_human` 除非命令在白名单）
  2. workspace 级 `~/.minibot/workspace/.minibot/approvals.yaml`（简易 allowlist）
  3. Project 级（P2-16 时再打通）
- 白名单命令示例：`ls`, `cat`, `rg`, `pwd`, `git status/diff/log`, `python -c "print(...)"`（只读心态）

## 5. Approval Queue

`agent/approval_queue.py`：

```python
class ApprovalQueue:
    async def submit(record) -> asyncio.Future
    def resolve(tool_call_id, approved: bool, note: str | None)
    def cancel(tool_call_id)     # abort 时清理
    def snapshot()               # 用于 GET /api/approvals
```

- 内存 dict + Future；record 也写文件用于恢复
- **headless run**（cron、goal 续跑）默认拒绝所有 `require_human`：`AgentRunContext.headless=True` 时 policy 走硬拒

## 6. Smart Approval

`agent/smart_approval.py`：

- 触发时点：policy 返回 `require_human` 之后
- 用**当前 provider 的最便宜 model**（`preset.smart_model` 覆盖），system prompt 明确："这是助手要执行的 shell/fs 动作，判断风险等级和是否需要人工"
- 输出结构化 JSON（pydantic）：`{ "verdict": "auto_allow|require_human", "reason": "...", "confidence": 0.0-1.0 }`
- `confidence >= 0.75` 且 `verdict == auto_allow` 时视为放行；其他都退回人工
- 每次决策落 `ApprovalRecord.smart=True` 便于审计

## 7. API

- `GET /api/approvals?status=pending` —— 列表
- `POST /api/approvals/{tool_call_id}` —— body `{ "approved": bool, "note"?: str }`
- `SSE` 通道复用 P0-4 全局 event stream，事件类型：`tool_call.pending_approval` / `tool_call.approved` / `tool_call.rejected`

## 8. 事件契约

沿用 chengxiaobang 命名：

```json
{ "type": "tool_call", "phase": "pending_approval", "tool_call_id": "...", "tool": "shell.exec", "args_preview": "...", "reason": "..." }
{ "type": "tool_call", "phase": "running", "tool_call_id": "...", "started_at": "..." }
{ "type": "tool_call", "phase": "completed|failed|rejected", "tool_call_id": "...", "result_preview": "..." }
```

## 9. Loop 集成

在 `runner.py` 执行工具前插入 hook：

```
decision = policy.evaluate(call)
if decision.requires_approval and not ctx.headless:
    if smart_approval:
        decision2 = await smart_approval.assess(call)
        if decision2.auto_allow: return await execute(call)
    fut = queue.submit(record)
    approved = await fut
    if not approved: return rejected_tool_result(call)
elif decision.deny_hard or (decision.requires_approval and ctx.headless):
    return rejected_tool_result(call, reason="headless/policy_deny")
return await execute(call)
```

## 10. 错误路径

- 用户长时间不审批 → 由 `ctx.approval_timeout`（默认 20 分钟）过期，作为 rejected 喂回；模型可以自行决定继续
- 应用重启 → pending 记录标记为 expired，恢复时不复活
- Abort run → queue.cancel 所有关联 tool_call_id
