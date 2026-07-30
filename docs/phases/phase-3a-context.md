# Phase 3a — Context 组装 + Compaction

**状态：** ✅ 已落地  
**主计划：** [`migration.md`](../migration.md)

## 范围（MVP）

| 子步骤 | 做 |
|--------|----|
| **3a.1** | `agent/context.py`：`build_system_prompt`（identity + `AGENTS.md`/`SOUL.md`/`USER.md` + session summary） |
| **3a.2** | 消息条数超阈值 → LLM 总结前文写入 `session.summary`，保留最近 N 条；Loop turn 结束后触发 |
| **3a.3** | Loop / context-usage 走 `build_system_prompt` |
| **Dev UI** | `/ui/context.html` + `GET /api/dev/context?session_id=` |

## 正常 / 异常 UI

| | |
|--|--|
| **正常** | workspace 有 `SOUL.md` → system 预览含人格；长会话压缩后 message 数下降、summary 可见 |
| **异常** | 无 session → 提示先创建；无 bootstrap → 「未命中」列表；压缩失败 → log `ok=false` |

## 刻意不做（→ 3b）

MEMORY.md / skills 注入、Dream 巩固。
