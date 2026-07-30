# P2-16 · Project + CLAUDE.md + Trust (Plan)

> spec：`specs/2026-07-26-p2-16-project-trust-design.md`  
> 依赖：P0-1 审批、P0-3 SQLite、P2-15 expert（system prompt 顺序）

## Constraints

- Trust 只在该 project 内生效；跨 project 不共享
- CLAUDE.md 大小上限 32 KiB
- 项目匹配"最长前缀"

## File map

| File | Role |
|---|---|
| `minibot/projects/models.py` |  |
| `minibot/projects/service.py` |  |
| `minibot/projects/matcher.py` | workspace→project |
| `minibot/agent/project_instructions.py` |  |
| `minibot/security/trust_profile.py` |  |
| `minibot/security/approval_policy.py` | 集成 trust |
| `minibot/api/routes/projects.py` |  |
| `minibot/agent/tools/project.py` |  |
| `tests/test_projects_service.py` |  |
| `tests/test_projects_matcher.py` |  |
| `tests/test_trust_profile.py` |  |
| `tests/test_project_instructions.py` |  |

## Task 1 — 模型 & CRUD

- [ ] Project pydantic + sqlite
- [ ] 单测

## Task 2 — Matcher

- [ ] 最长前缀
- [ ] linked_paths 支持
- [ ] 单测

## Task 3 — CLAUDE.md 注入

- [ ] 加载 + 截断
- [ ] system prompt 顺序
- [ ] 单测

## Task 4 — Trust profile

- [ ] add/remove/list + 过期
- [ ] 集成 policy
- [ ] 单测：命中直接允许、过期后要求人工

## Task 5 — 工具 + REST

- [ ] `project` 工具
- [ ] REST 路由
- [ ] TestClient

## Task 6 — 与 session 打通

- [ ] session.project_id 自动匹配
- [ ] 事件推送

## Task 7 — 文档

- [ ] `docs-plan/phase-p2-16-project-trust.md`

## 验收

- 手工：创建 project 后新会话绑到它 → system prompt 出现 CLAUDE.md 内容
- 手工：trust_add shell "^git " → 后续 git 命令直接放行；trust_remove 后回到 require_human
- 手工：ttl 24h 后自动过期
