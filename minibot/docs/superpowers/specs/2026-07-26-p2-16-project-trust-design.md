# P2-16 · Project + CLAUDE.md + Trust (Design)

> 对齐 `chengxiaobang/apps/backend/src/agent/project-instructions.ts` + `project-approval-trust.ts` + `tools/project-tools.ts`

## 1. 目标

引入"项目"概念：多个 workspace 归到同一 project；项目级 CLAUDE.md/AGENTS.md 自动注入 system prompt；项目级审批授信（trust list）——用户信任的命令/路径在该项目内不再询问。

## 2. 数据

```python
class Project(BaseModel):
    id: str
    name: str
    root: str              # 主 workspace，绝对路径
    linked_paths: list[str]
    created_at: str
    updated_at: str
    trust: TrustProfile

class TrustProfile(BaseModel):
    shell_allow_regex: list[str] = []
    fs_write_allow_globs: list[str] = []
    web_domains: list[str] = []
    auto_approve_expires_at: str | None = None
```

存 sqlite `projects` 表；`sessions` 新增 `project_id`。

## 3. 项目匹配

- Session 绑定 workspace → 查询 projects 表匹配（root 是 workspace 前缀 或 linked_paths 包含 workspace）
- 匹配到多个：取最长前缀
- 未匹配：session `project_id=null`，按老逻辑（不注入 project 指令）

## 4. 指令注入

`agent/project_instructions.py`：

- 加载 `<project.root>/CLAUDE.md` 和 `AGENTS.md`（AGENTS.md 是 CLAUDE.md 软链或独立文件）
- 拼进 system prompt（在 expert 之前，base 之后）
- 尺寸上限 32 KiB，超出截断 + warning

## 5. Trust 集成

- P0-1 approval policy 询问前先查 `TrustProfile.matches(call)`；匹配的直接放行
- `auto_approve_expires_at` 支持"信任 24 小时"
- 记录事件 `approval.auto_allowed{reason:trust}`

## 6. 工具

```
project(action, ...)
  action: current | trust_add | trust_remove | trust_list | update_meta
  trust_add: {kind: shell|fs_write|web, pattern, ttl_hours?}
```

- Trust 变更本身是敏感动作，要用户在 UI 确认（走 P0-1 require_human）

## 7. REST

- `GET /api/projects` / `GET /api/projects/{id}`
- `POST /api/projects` / `PATCH /api/projects/{id}`
- `POST /api/projects/{id}/trust` / `.../trust/remove`

## 8. 与 expert / goal 共存

- system prompt 顺序：base → project → expert → goal
- Trust 只影响 approval，不影响 plan_mode guard

## 9. 过期清理

- 启动时扫描 `auto_approve_expires_at < now`，移除过期条目

## 10. 观测

- 匹配到 project 时事件 `session_updated{ project_id, project_name }`
- Trust 命中事件计入 approval SSE
