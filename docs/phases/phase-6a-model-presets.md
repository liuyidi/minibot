# Phase 6a — Model Presets MVP

**状态：** ✅ 完成  
## 做了什么

- `AppConfig.model_presets` + `active_preset`
- 激活 → 覆写 live `model`/`api_key`/`api_base` → `rebuild_provider()`
- API：upsert / activate / delete；`GET /api/dev/providers`
- Dev UI Settings：preset 下拉 + 新建/删除/切换/保存
- 密钥脱敏；空 key 不覆盖；不能删最后一个

## 刻意不做

Anthropic 原生、Fallback、nanobot 全量导入、完整 registry。

## 验证

```bash
cd minibot && .venv/bin/pytest tests/test_model_presets.py tests/test_api.py -q
```

手动：Chat Settings 新建 openai preset → 切换激活 → 发消息看 trace `model` / 实际请求 base。
