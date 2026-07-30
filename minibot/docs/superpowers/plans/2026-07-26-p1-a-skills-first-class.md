# P1-A · Skills 升级为一等公民 (Plan)

> spec：`specs/2026-07-26-p1-a-skills-first-class-design.md`  
> 依赖：无硬依赖；建议在 P2-13/P2-15 之前落地，锁定接口

## Constraints

- 不缓存 SKILL.md 正文（按需读）
- 短名冲突严格检测
- 清单总字符 ≤ 4 KiB

## File map

| File | Role |
|---|---|
| `minibot/agent/skills.py` | 升级 Registry |
| `minibot/agent/context.py` | 清单注入 |
| `minibot/agent/tools/skill_tool.py` | 新增 `skill()` 工具 |
| `minibot/agent/tools/builtin.py` | 注册新工具 |
| `minibot/api/routes/skills.py` |  |
| `minibot/skills/` | 内置示范技能 |
| `tests/test_skills_registry.py` |  |
| `tests/test_skill_tool.py` |  |
| `tests/test_skills_snapshot.py` |  |
| `tests/test_skills_conflict.py` |  |

## Task 1 — 数据模型 + 加载器

- [ ] `SkillDescriptor` / `SkillBody` dataclass
- [ ] 扫描三来源：`minibot/skills/`（内置）+ `~/.minibot/skills/` + `~/.minibot/plugins/*/skills/`
- [ ] frontmatter 解析（复用现有 regex + pydantic 校验）
- [ ] mtime 缓存 descriptor（正文不缓存）
- [ ] 单测：三来源合并、mtime 触发 reload

## Task 2 — Registry API

- [ ] `list_all` / `list_visible(plugin_scope, expert_overlay, disabled)`
- [ ] `find(name)` 支持短名与全名解析
- [ ] `load_body(name)` 大文件截断
- [ ] 单测：overlay/disabled 组合

## Task 3 — 冲突处理

- [ ] 用户级同短名覆盖插件级
- [ ] 多插件同短名 → `ambiguous_name`
- [ ] 单测

## Task 4 — `skill()` 工具

- [ ] 工具签名 + 描述文案
- [ ] 从 registry.load_body 拿正文
- [ ] 事件 `skill.loaded`
- [ ] 单测：命中/未命中/歧义

## Task 5 — Context 注入

- [ ] `build_skill_listing(descriptors)` 生成文本
- [ ] 4 KiB 截断策略（always 优先）
- [ ] 插入到 system prompt 指定位置
- [ ] 单测：截断、[核心] 标签、无技能时不注入

## Task 6 — Dev API

- [ ] `GET /api/skills`
- [ ] `GET /api/skills/{name}`
- [ ] TestClient

## Task 7 — 迁移与文档

- [ ] 老 `SkillsRegistry().list()` 用 `list_visible()` 替换
- [ ] `docs-plan/phase-p1-a-skills.md`
- [ ] README 一节"技能"

## 验收

- pytest 全绿
- 手工：放三个 SKILL.md（内置/用户/插件）→ system prompt 清单只列 name+description
- 手工：模型 `skill(name='xxx')` 后能看到完整正文
- 手工：制造短名冲突 → tool 报 `ambiguous_name`
- 手工：technicians overlay（预演 P2-15 场景）→ 指定技能出现 [核心] 标签

## 后续 phase 接线（不在本 phase 实施，只记录接口约束）

- P2-13 Plugin：`PluginService.enabled_plugins()` 返回列表给 `list_visible(plugin_scope=...)`
- P2-15 Expert：`expert.refs.skills` 传入 `list_visible(expert_overlay=...)`
- P2-13 单项停用：`disabled` 参数消费 `PluginService.disabled_items("skill")`
