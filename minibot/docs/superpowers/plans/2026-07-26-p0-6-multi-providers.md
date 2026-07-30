# P0-6 · Provider 多后端 (Plan)

> spec：`specs/2026-07-26-p0-6-multi-providers-design.md`

## Constraints

- Runner 只依赖 provider 抽象，不 import 具体 SDK
- 新增 SDK 是可选依赖：extras（`minibot[anthropic]`, `[azure]`, `[bedrock]`）
- 未装 SDK 时对应 provider 的 build 报清晰错误

## File map

| File | Role |
|---|---|
| `minibot/providers/base.py` | 升级抽象 |
| `minibot/providers/registry.py` | 新 |
| `minibot/providers/openai_compat.py` | 适配新抽象 |
| `minibot/providers/anthropic.py` | 新 |
| `minibot/providers/azure_openai.py` | 新 |
| `minibot/providers/bedrock.py` | 新 |
| `minibot/providers/events.py` | LLMEvent 类型 |
| `minibot/config/presets.py` | 扩展 preset |
| `minibot/agent/runner.py` | 用新 event 迭代器 |
| `minibot/api/routes/misc.py` | `/api/dev/providers` |
| `pyproject.toml` | extras |
| `tests/test_provider_registry.py` |  |
| `tests/test_anthropic_provider.py` |  |
| `tests/test_azure_provider.py` |  |
| `tests/test_bedrock_provider.py` |  |
| `tests/test_provider_fallback.py` |  |

## Task 1 — 抽象升级

- [ ] `LLMEvent` 统一枚举
- [ ] `LLMProvider` Protocol
- [ ] `ProviderCaps` dataclass
- [ ] `registry` register/build/caps
- [ ] 单测：注册两个 fake，用 registry.build

## Task 2 — 现有 openai-compat 迁移

- [ ] 适配新事件流
- [ ] 保证现有单测 & 集成路径不回归
- [ ] preset schema 兼容

## Task 3 — Anthropic

- [ ] 依赖 `anthropic>=0.x` extras
- [ ] tool_use 翻译
- [ ] thinking 通道
- [ ] 单测：mock httpx / anthropic client

## Task 4 — Azure OpenAI

- [ ] preset 新字段
- [ ] client 初始化差异
- [ ] 单测：mock openai client

## Task 5 — Bedrock

- [ ] 依赖 `boto3` extras
- [ ] converse_stream + tool schema
- [ ] 单测：mock bedrock-runtime

## Task 6 — Fallback

- [ ] preset.fallback_ids
- [ ] runner 层 wrap：主失败按序切
- [ ] 单测：两个 preset，一个抛错

## Task 7 — Runner 接线

- [ ] AppState 拿 provider by kind (main/fast/smart)
- [ ] smart_approval / session_title / compaction 全部走 registry
- [ ] 单测：多 kind 独立配置

## Task 8 — Dev API + 文档

- [ ] `GET /api/dev/providers`
- [ ] README 增加"多 provider"章节
- [ ] `docs-plan/phase-p0-6-multi-providers.md`

## 验收

- pytest 全绿
- 手工：切到 anthropic preset 打通一轮工具调用
- 关掉主 preset key → fallback 自动生效
