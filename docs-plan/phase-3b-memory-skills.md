# Phase 3b — Memory + Skills

**状态：** ✅ 完成  
**主计划：** [`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md)

## 范围（MVP）

| 子步骤 | 状态 | 内容 |
|--------|------|------|
| **3b.1** | ✅ | `agent/memory.py` + `read_memory` / `write_memory`；system 注入 `# Memory` |
| **3b.2** | ✅ | `agent/skills.py`：builtin + workspace `skills/`；frontmatter |
| **3b.3** | ✅ | 内置：`memory`（always）、`github`、`summarize` |
| **3b.4** | ⏭ | Dream **不做** |
| **3b.5** | ✅ | `GET /api/webui/skills` 真数据 |
| **Dev UI** | ✅ | 独立页：`/ui/memory.html`、`/ui/skills.html`（Context 只保留 flags 链接） |

## 正常 / 异常

| | |
|--|--|
| **正常** | 有 MEMORY.md → `flags.memory`；skills ≥3；write_memory 落盘 |
| **异常** | 无 MEMORY → `memory: no`；workspace 同名 skill 覆盖 builtin |

## 刻意不做

Dream、技能 install 安装器、完整 cron/long-goal 运行时（Phase 4+）。

## 验证

```bash
cd minibot && pytest tests/test_memory_skills_phase3b.py tests/test_context_phase3a.py -q
```
