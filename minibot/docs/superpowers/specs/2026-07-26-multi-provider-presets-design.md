# minibot Multi-Provider Presets（MVP / 方案 A）

**日期：** 2026-07-26  
**状态：** 待审阅  
**范围：** 插队 Phase 6 子集 — 多套 OpenAI-compat 命名配置，便于切换 DeepSeek / OpenAI / 内网网关等  
**非目标：** Anthropic 原生、Bedrock、OAuth、Fallback 链、图片/语音、完整 nanobot registry 移植

---

## 背景

minibot 当前只有一组生效字段：`model` + `openai_api_key` + `openai_base_url`，经 `OpenAICompatProvider` 发请求。`provider` 字符串不参与选实现。用户需要在多个 LLM 端点间切换，而不引入多协议复杂度。

## 目标

1. 可保存多套 **model presets**（label / model / api_key / api_base）
2. 一键切换 **active preset** → 重建 provider，下一轮 Chat 使用新端点
3. Dev UI 可增删改查；对外 API key **脱敏**
4. 与现有 `GET/PATCH /api/settings` 兼容（顶层生效字段仍是单一真相源）

## 方案（已选）

**Preset 列表 + 切换时覆写生效字段 + `rebuild_provider()`**  
不保留多实例 provider 池。

---

## 数据模型

落盘：`~/.minibot/config.json`（`AppConfig`）

```json
{
  "model": "deepseek-v4-flash",
  "provider": "openai",
  "openai_api_key": "…",
  "openai_base_url": "https://api.deepseek.com/v1",
  "temperature": 0.2,
  "active_preset": "default",
  "model_presets": [
    {
      "id": "default",
      "label": "DeepSeek",
      "model": "deepseek-v4-flash",
      "api_key": "…",
      "api_base": "https://api.deepseek.com/v1",
      "temperature": 0.2
    },
    {
      "id": "openai",
      "label": "OpenAI",
      "model": "gpt-4o-mini",
      "api_key": "…",
      "api_base": "https://api.openai.com/v1"
    }
  ]
}
```

### 字段约定

| 字段 | 说明 |
|------|------|
| `model_presets[].id` | 稳定 id（slug，如 `default` / `openai`）；创建时生成 |
| `label` | UI 展示名 |
| `model` / `api_key` / `api_base` | OpenAI-compat 三件套 |
| `temperature` | 可选；缺省用全局 `AppConfig.temperature` |
| `active_preset` | 当前选中的 preset id |

### 生效字段同步规则

- **激活 preset** 时：把该 preset 的 `model/api_key/api_base/(temperature)` 写入顶层 `AppConfig` 对应字段，然后 `save` + `rebuild_provider()`。
- **PATCH 顶层 settings**（现有行为）：同时**回写**当前 `active_preset` 对应条目（若存在），避免列表与生效字段分叉。
- **启动迁移**：若 `model_presets` 为空，用当前顶层字段生成一条 `id=default`，`active_preset=default`。

---

## API

| 方法 | 路径 | 行为 |
|------|------|------|
| GET | `/api/settings` | payload 含真实 `model_presets`（key 脱敏）+ `active_preset` |
| PATCH | `/api/settings` | 更新顶层字段；同步回写 active preset；`rebuild_provider` |
| POST | `/api/settings/model-configurations` | 创建或 upsert preset（body: id?/label/model/api_key/api_base/temperature?/activate?） |
| POST | `/api/settings/model-configurations/{id}/activate` | 设为 active 并 rebuild |
| DELETE | `/api/settings/model-configurations/{id}` | 删除；不可删最后一个；若删的是 active → 切到剩余第一条 |
| GET | `/api/settings/provider-models` | 本阶段仍可返回 `[]`（手填 model） |
| GET | `/api/dev/providers` | 当前 active preset 摘要（脱敏）：label、model、api_base、provider 实现名 `openai_compat` |

密钥规则：对外永不回传完整 key；用 `****` + 末 4 位；写入时空字符串表示「保持原 key 不变」。

---

## Dev UI

1. **Settings 抽屉**：preset 下拉（切换即 activate）；表单编辑当前项的 label/model/base/key；「新建」「删除」按钮。
2. **Chat 顶栏 / bootstrap**：显示 `active_preset.label · model`。
3. **可选页** `/ui/providers.html`（轻量）：列表 + 激活状态，便于调试（非必须，Settings 够用可先不做）。

### Insight UI（正常 / 异常）

| | |
|--|--|
| **正常** | 建「openai」preset → activate → 下一轮 `llm_request.model` / 实际 base 变为新配置；Settings 列表可见两条 |
| **异常** | activate 缺 `api_key` 或空 `api_base` → 400 + UI 提示；删除最后一个 → 拒绝 |

---

## 运行时

- 继续只用 `OpenAICompatProvider`；`app_state.rebuild_provider()` 读顶层生效字段。
- Trace / Langfuse：现有 `model` 字段即可；本阶段不强制加 `preset_id`（可在 prepare.context 顺手带上 `active_preset`，可选）。

---

## 测试

- 单元：迁移空 presets → default；activate 覆写顶层；PATCH 回写 active；删 last 失败；空 key 保留原值
- API：create / activate / delete / GET 脱敏
- 可选：FakeProvider + 切换后 loop 使用新 model 字符串

---

## 文档与计划勾选

- 短计划：`docs-plan/phase-6a-model-presets.md`（实现时写）
- 主计划 Phase 6 旁注：MVP presets ✅；完整 registry / 导入后置
- README：如何添加第二套 LLM

---

## 刻意不做（对照 nanobot）

- `providers/registry.py` 多 backend
- `FallbackProvider` / `provider_switched` toast
- 从 `~/.nanobot/config.json` 全量导入（可后续单独做「只导入 openai-compat presets」）
- per-turn 临时换模型（Composer UX-03）

---

## 验收清单

- [ ] 至少两套 presets 可持久化并切换
- [ ] 切换后 Chat 真实请求新 `api_base`/`model`
- [ ] 密钥脱敏；空 key 不覆盖
- [ ] 删除约束与错误提示
- [ ] 相关 pytest 通过
