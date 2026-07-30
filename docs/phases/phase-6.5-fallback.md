# Phase 6.5 — Fallback / Retry

**状态：** ✅  
**主计划：** [`migration.md`](../migration.md) §Phase 6.5

## 做了什么

- `providers/fallback.py`：`FallbackProvider` + `ProviderSlot`；`finish_reason=error` / timeout / 连接错误时切下一档
- `ModelPreset.fallback: list[str]`；`build_provider_chain()` 按 active preset 组装链
- Runner：`provider_switched` 事件 + trace/`AgentRunResult.used_provider`
- WS：`provider_switched`；Chat toast；`runtime.html` 显示 switches 计数
- `/api/dev/runtime` 增加 `fallback` 字段

## Dev UI 调试（Runtime）

`/ui/runtime.html` → **Provider fallback · Insight**

- 展示 failover rules（soft error / 429 / 5xx / timeout / connection）与 chain slots
- **离线模拟** `POST /api/dev/fallback/simulate`：Fake primary 失败 → backup，写入 live `fallback_stats`
- **实弹** `POST /api/dev/fallback/arm` + `probe-live`：给 live primary 注入故障后跑 Loop turn
- `POST /api/dev/fallback/disarm` 取消注入

## 验证

```bash
cd minibot && .venv/bin/pytest tests/test_fallback_phase65.py tests/test_providers_phase6.py -q
```

手动：打开 Runtime → 点「soft error / 429 / 503 / timeout / connection」离线模拟 → switches+1、reason_kind 对齐。
