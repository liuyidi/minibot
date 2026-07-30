# P0-5 · Compaction 升级 (Plan)

> spec：`specs/2026-07-26-p0-5-compaction-design.md`

## Constraints

- 不引入新依赖（tiktoken 已是 openai 传递依赖，其他 provider 用各自 tokenizer 或 fallback）
- fast_model 未配置时功能仍可用（fallback chars/4 + skip 主 compact）

## File map

| File | Role |
|---|---|
| `minibot/agent/context_usage.py` | 新（Token accounting） |
| `minibot/agent/compaction.py` | 新（主 compact） |
| `minibot/agent/micro_compact.py` | 新 |
| `minibot/agent/tools/base.py` | tool 描述加 `micro_compact_optout` |
| `minibot/agent/runner.py` | tool_result 序列化 hook + compact 触发点 |
| `minibot/config/app_config.py` | 新增字段 |
| `minibot/api/routes/misc.py` | `/api/dev/context/{sid}` |
| `tests/test_context_usage.py` |  |
| `tests/test_compaction.py` |  |
| `tests/test_micro_compact.py` |  |

## Task 1 — Token accounting

- [ ] 提取 provider tokenizer；openai 用 tiktoken；缺失用 chars/4
- [ ] `estimate(messages, system, tools) -> UsageBreakdown`
- [ ] 单测：几组 fixture，误差 < 5%

## Task 2 — 主 compact

- [ ] `should_compact(usage)` 判定
- [ ] `select_ranges` 保护 tool_call 对
- [ ] `summarize(range)` 走 fast_model；失败 → skip
- [ ] `persist_compact(session_id, new_history)`
- [ ] 单测：脚本 provider，压前 20 条 → 压后 1 summary + 保留最近 16 + tool_call 对完好

## Task 3 — Micro-compact

- [ ] serialize hook：`if len(result) > threshold and not opt-out`
- [ ] `micro_summarize(result_json)`
- [ ] 消息里存 summary + 元数据；`tool_calls.result_json` 保全量
- [ ] 单测：命中/不命中/失败降级

## Task 4 — Runner 接线

- [ ] 每轮结束前评估是否压缩
- [ ] 30s 冷却
- [ ] 事件：`session_updated{compact:{before,after,kept}}`
- [ ] 单测：脚本 provider 触发 compact

## Task 5 — Dev API + 文档

- [ ] `GET /api/dev/context/{sid}`
- [ ] `docs-plan/phase-p0-5-compaction.md`

## 验收

- pytest 全绿
- 手工：造一个长对话，观察 compact 事件；tool_call/tool_result 数量对称
- 关掉 fast_model：主 compact skip，micro-compact 也 skip，run 不崩
