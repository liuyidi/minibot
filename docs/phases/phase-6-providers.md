# Phase 6 — Providers registry + Anthropic + nanobot import

**状态：** ✅ 核心完成（6.1 registry / Anthropic；6.4 导入 MVP）  
**参照：** CrewAI `llms/providers/*`、nanobot `providers/registry.py`

## 做了什么

- `providers/registry.py`：小型 ProviderSpec 表（openai / anthropic / openrouter / deepseek / ollama / custom + azure/bedrock stub）
- `providers/factory.py`：`build_provider()` 按 registry backend 选实现
- `providers/anthropic.py`：httpx Messages API（无 anthropic SDK 依赖）；OpenAI 消息/工具转换；chat + SSE stream
- `AppState.rebuild_provider` 改走 factory
- ModelPreset 增加 `provider` 字段；Settings / Dev UI 可选 anthropic
- `config/nanobot_import.py` + `GET/POST /api/dev/nanobot-import`
- Insight UI：`/ui/providers.html`（正常：registry 绿；异常：stub 黄；导入黄条）

## 刻意不做（后续）

- Azure / Bedrock / Codex / Copilot 真实现（registry stub）
- Phase 6.5 Fallback / Retry
- OAuth（6.3）
- 完整 settings 表面（6.2 边角 API）

## 验证

```bash
cd minibot && .venv/bin/pytest tests/test_providers_phase6.py tests/test_model_presets.py -q
```

手动：Settings 新建 anthropic preset → activate → `/ui/providers.html` 看 runtime_class 含 `AnthropicProvider`。
