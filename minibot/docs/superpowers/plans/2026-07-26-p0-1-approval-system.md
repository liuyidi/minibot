# P0-1 · Approval System (Plan)

> 对应 spec：`specs/2026-07-26-p0-1-approval-system-design.md`

## Global constraints

- Runner 合同不变（`handle_turn` 签名不变）
- headless run（cron/goal 续跑）自动拒绝所有 require_human
- smart approval 失败/无 model 时**降级到人工**，不静默通过

## File map

| File | Role |
|---|---|
| `minibot/security/approval_policy.py` | 规则表 + `evaluate()` |
| `minibot/agent/approval_queue.py` | 内存队列 + Future |
| `minibot/agent/smart_approval.py` | 小模型判断（P0-6 provider 抽象共用） |
| `minibot/agent/tools/base.py` | 工具描述里加 `mutating: bool` 字段 |
| `minibot/agent/runner.py` | 执行前插入审批 hook |
| `minibot/api/routes/approvals.py` | REST 路由 |
| `minibot/config/app_config.py` | `approval_timeout_sec`, `smart_approval_enabled` |
| `tests/test_approval_policy.py` |  |
| `tests/test_approval_queue.py` |  |
| `tests/test_smart_approval.py` |  |

## Task 1 — Policy 层

- [ ] 定义 `ApprovalDecision` / `ApprovalReason` 枚举
- [ ] 内置规则表：shell allowlist、fs write 默认 require_human、web_fetch 依 URL 分类
- [ ] `.minibot/approvals.yaml` 加载器（optional）
- [ ] 单测：allowlist 命令直放、非白名单命令 require_human、fs write 触发、无效 yaml 降级

## Task 2 — Approval Queue

- [ ] `submit()` 返回 Future 并广播 event
- [ ] `resolve()` 落 status + 完成 Future
- [ ] `cancel()` 用于 abort/超时
- [ ] 持久化 `~/.minibot/data/approvals/*.json`（可选，重启后过期）
- [ ] 单测：submit→resolve、超时、cancel、并发多条

## Task 3 — Runner hook

- [ ] `AgentRunContext.headless` 字段
- [ ] runner 执行工具前调用 policy + queue
- [ ] 拒绝时构造 `ToolRejected` result 喂回模型
- [ ] 事件写入 event stream（临时用现有 SSE，P0-4 完成后切全局）
- [ ] 单测：脚本化 provider，验证 pending → 外部 resolve → running → completed 的事件顺序

## Task 4 — Smart Approval

- [ ] `assess(call, provider) -> SmartVerdict` pydantic 结构
- [ ] 从 AppConfig 读 `smart_approval_enabled`, `smart_model`
- [ ] 失败/超时/无 key 时直接返回 `require_human`
- [ ] 单测：mock provider，构造两种输出，验证阈值判定与降级

## Task 5 — REST + SSE

- [ ] `GET /api/approvals` 支持 `?status=pending|resolved|all`
- [ ] `POST /api/approvals/{id}` body `{approved, note?}`
- [ ] 未认证/未知 id → 4xx
- [ ] 事件类型加入现有 SSE encoder
- [ ] TestClient：审批走通、拒绝走通、id 不存在 404

## Task 6 — Headless 兼容 & 文档

- [ ] cron / goal 续跑代码路径注入 `headless=True`（占位，等 P1-7/P1-9 落地）
- [ ] `docs-plan/phase-p0-1-approval.md` 迁移检查表
- [ ] 补 README 一节"审批机制"

## 验收

- pytest 全绿
- 手工链路：CLI 发一条要 `shell.exec rm -rf tmp` 的请求 → CLI 提示 pending → 通过 `curl POST /api/approvals/...` 放行 → 观察工具执行
- headless 场景：制造 `handle_turn(headless=True)`，同样命令直接被拒
