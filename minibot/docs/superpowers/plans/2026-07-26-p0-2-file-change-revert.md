# P0-2 · File-change 追踪 + Revert (Plan)

> spec：`specs/2026-07-26-p0-2-file-change-revert-design.md`

## Constraints

- 现有 filesystem 工具接口不变，加装饰或内部 hook
- 不追踪 `~/.minibot/data/` 自身写操作，避免 loop
- 大文件降级策略必须早于 quota 命中

## File map

| File | Role |
|---|---|
| `minibot/agent/tools/file_state.py` | before/after 捕获与记录 |
| `minibot/agent/tools/file_revert.py` | revert 核心逻辑 |
| `minibot/agent/tools/filesystem.py` | hook 接线 |
| `minibot/agent/tools/builtin.py` | 注册 `file_history`, `file_revert` |
| `minibot/api/routes/file_changes.py` |  |
| `minibot/session/store.py` | 存 change 索引（P0-3 后转 sqlite） |
| `tests/test_file_state.py` |  |
| `tests/test_file_revert.py` |  |

## Task 1 — 内容存储

- [ ] 目录布局 + 写入函数（原子写：先 tmp 再 rename）
- [ ] sha256 + size 计算
- [ ] 大文件降级到摘要
- [ ] 单测：小/中/大文件都能存

## Task 2 — Hook 到 filesystem 工具

- [ ] `write_file` 前拿 before，写完记 after
- [ ] `edit_file` 同上
- [ ] `delete_file`（若新加）：保 before，after=None
- [ ] 单测：三种 op 各写一次，检查记录字段

## Task 3 — Revert 核心

- [ ] `revert(change_id)` 全路径
- [ ] `revert_by_tool_call(id)` 批量
- [ ] 冲突/缺失/权限错误分支
- [ ] 单测：4 种成功场景 + 2 种冲突场景

## Task 4 — 工具与 REST

- [ ] 内置工具 `file_history`, `file_revert`（走审批）
- [ ] REST 路由 + TestClient
- [ ] SSE 事件 `file_change.recorded` / `file_change.reverted`

## Task 5 — 清理策略

- [ ] 启动时清理过期
- [ ] Quota 达标 LRU 驱逐
- [ ] 单测：驱逐后记录仍能查询、但 revert 返回 unrevertable

## Task 6 — 文档

- [ ] README 补一节"改动追踪与撤销"
- [ ] migration checklist（现有 workspace 不需要迁移，只是启用后开始记录）

## 验收

- pytest 全绿
- 手工：让 agent 帮忙改一个 markdown → `POST revert` → 内容还原
- 制造外部改动，验证 revert 冲突
