# minibot 现状（进度快照）

> 更新日期：2026-08-06  
> 代码根：[`minibot/`](../minibot/)  
> 主计划：[`migration.md`](./migration.md)  

本文回答三件事：**已经实现了什么**、**配置在哪里**、**下一刀是什么**。细节以代码与迁移计划 checklist 为准。

---

## 1. 一句话结论

minibot 已是可本地跑通的 **FastAPI agent 运行时 + 内嵌 Dev UI / 产品 WebUI**：

- 鉴权 bootstrap、JSONL 会话、**AgentLoop + MessageBus**、ReAct Runner
- **流式** delta / reasoning / Stop；真实 coding 工具 + MCP + cron + memory/skills + compaction
- **多 provider（已落地）**：registry、OpenAI-compat、Anthropic Messages、用户 model presets、**平台多 slot 内置模型（Approach A）**、**preset Fallback 链（6.5）**
- mini-langfuse **软依赖旁路**（默认关）；minikb 只读转发 + Knowledge Dev UI
- **未做 / 待做主线**：Composer / Phase 8 收尾、正式切换 WebUI（Phase 9）；平台 Auto **跨模型失败切换**仍未接线（见 §4.5）。**Phase 7 `/v1` 优先级最低（放最后）**
- **已实现的安全暂停**：高风险工具 HITL 审批（持久化、REST / WS、Dev UI / WebUI 卡片）

默认监听：`http://127.0.0.1:8766` · Dev UI：`/ui/`

---

## 2. 进度快照（相对迁移计划）

```text
【已完成 ✅】
  Phase 0 + Testing Infra + Dev UI 约定
  Phase 1 + UX-10 工具卡片
  Phase 1.5A sync spawn
  Phase 3a context + compaction
  Phase 3b memory + skills
  Phase 5 MCP + mcp.html
  Phase 6a model presets + Settings 侧栏
  Phase 10 mini-langfuse 旁路（observability.html 已取消）
  Phase 4 cron + automations.html
  Phase 2 流式 + reasoning + Stop
  Phase 6 余量 registry + Anthropic + nanobot 导入 MVP
  Phase 6.5 Fallback / Retry（toast + runtime stats）—— 作用在用户 preset.fallback
  平台 builtin 多 slot（.env.models）+ WebUI Models 单选 / Auto 首可用
  KB Dev UI（minikb 转发）
  Phase 11 核心 HITL

【下一刀】
  ① Composer P0 / API GET→POST 债（docs/plans/api-mutation-post-body.md）
  ② Phase 8 收尾（commands /model…；8.1/8.3 已部分完成）
  ③ Phase 9 / 12 / …（见 migration checklist）
  （最后）Phase 7 /v1 chat completions
  （可选）平台 Auto / catalog 失败时链式切换（目前仅 preset.fallback）
```

阶段笔记：[`phases/`](./phases/)。平台模型设计：[`superpowers/specs/2026-08-06-platform-models-keys-design.md`](./superpowers/specs/2026-08-06-platform-models-keys-design.md)。统一客户端合同：[`client-api.md`](./client-api.md)。

---

## 3. 配置放在哪里？

三层配置，优先级大致：

```text
环境变量 / .env（含 .env.models 合并）  →  Settings + platform_models 读 env
       ↓ 可覆盖默认值；平台密钥永不写入 config
~/.minibot/config.json  →  AppConfig（Settings API 持久化）
       ↓ 运行时改模型 / preset / MCP / active_platform_model
AppState.config + rebuild_provider() / MCP reconnect
```

### 3.1 环境变量 / `.env`（进程级）

| 项 | 说明 |
|----|------|
| **前缀** | `MINIBOT_SERVER_`（`minibot/config/settings.py`） |
| **推荐拆分** | `.env.runtime` + `.env.models` → `./scripts/merge-env.sh` → `.env`（gitignore） |
| **加载文件** | 工作目录 `.env`；`platform_models` 也会读 `.env` / `.env.models`（dotenv） |
| **另支持** | 裸 `OPENAI_API_KEY`（当对应 slot / `MINIBOT_SERVER_OPENAI_API_KEY` 为空时回退） |

常用运行时变量：

| 变量 | 默认 | 含义 |
|------|------|------|
| `MINIBOT_SERVER_HOST` / `PORT` | `127.0.0.1` / `8766` | 绑定 |
| `MINIBOT_SERVER_AUTH_SECRET` | 空 | 设置后 bootstrap 需带 auth header |
| `MINIBOT_SERVER_REQUIRE_AUTH` | `false` | 强制校验 token |
| `MINIBOT_SERVER_DATA_DIR` | `~/.minibot` | 数据根 |
| `MINIBOT_SERVER_CONFIG_PATH` | 空 | 覆盖默认 config 路径 |
| `MINIBOT_SERVER_MAX_ITERATIONS` / `TEMPERATURE` | `8` / `0.2` | ReAct / 采样 |
| `MINIBOT_SERVER_LANGFUSE_*` | 默认关 | mini-langfuse 旁路 |
| `MINIBOT_SERVER_MINIKB_*` | 空 | 启用 kb_* 工具与 Knowledge 页 |

**平台多 slot 模型**（示例见 `minibot/.env.models.example`）：每个 slot 独立 `API_KEY` / `BASE_URL` / `MODEL`，避免重复写 `MINIBOT_SERVER_MODEL` 互相覆盖：

| Slot 示例 | 变量前缀 | 用途 |
|-----------|----------|------|
| `openai` | `MINIBOT_SERVER_OPENAI_*` | 常作 DeepSeek flash 等兼容端点 |
| `deepseek_pro` | `MINIBOT_SERVER_DEEPSEEK_PRO_*` | 另一 DeepSeek 模型 |
| `qwen` / `glm` / `kimi` / `minimax` / `doubao` | `MINIBOT_SERVER_{SLOT}_*` | 目录内其它平台模型 |

密钥只存在于进程 env；选中平台模型时 **不会** 写入 `config.json`。

### 3.2 持久化 JSON：`~/.minibot/config.json`

| 项 | 说明 |
|----|------|
| **默认路径** | `{data_dir}/config.json` → 通常 **`~/.minibot/config.json`** |
| **读写** | `load_app_config` / `save_app_config`；改 settings / preset 会写盘并 `rebuild_provider` |
| **沙箱回退** | 无法创建 `data_dir` 时用 `./.minibot-data` |

`AppConfig` 主要字段：`model`、`provider`（含 `"auto"`）、`active_platform_model`、`openai_api_key`（用户 BYOK）、`openai_base_url`、`temperature`、`max_iterations`、compaction 相关、`active_preset`、`model_presets`（含 `fallback: [presetId,…]`）、`mcp_presets`。

### 3.3 落盘数据

| 数据 | 路径 / 说明 |
|------|-------------|
| **会话消息** | `{data_dir}/sessions/<id>.jsonl` |
| **Memory** | workspace / agent 约定的 `MEMORY.md` 等（Phase 3b） |
| **Cron jobs** | cron 服务持久化（Phase 4） |
| **Bootstrap token** | 仍主要在内存 `AppState.tokens`（重启失效） |

### 3.4 与 nanobot 配置

| | nanobot | minibot |
|--|---------|---------|
| 主配置 | `~/.nanobot/config.json` | `~/.minibot/config.json` |

---

## 4. 已实现能力（按子系统）

### 4.1 进程与 Dev UI

| 能力 | 状态 |
|------|------|
| `minibot` / `python -m minibot` | ✅ uvicorn |
| 内嵌 Dev UI `/ui/` | ✅ Chat / Trace / Runtime / Tools / Context / Memory / Skills / MCP / Automations / Providers / Knowledge / Session Files / Race 等 |
| `GET /health` | ✅ `{status, runtime: minibot}` |

### 4.2 鉴权与会话

| 能力 | 状态 |
|------|------|
| bootstrap + Bearer / `X-Minibot-Auth` | ✅ |
| Sessions REST + JSONL | ✅ |
| Pairing / 多用户 | ❌ Phase 14 |

### 4.3 WebSocket `/ws`

| 能力 | 状态 |
|------|------|
| `new_chat` / `attach` / `message` | ✅ |
| 流式 `delta` / `reasoning_*` / `stream_end` / `abort` | ✅ Phase 2 |
| `approval_required` / `approval_response` | ✅ HITL；页面刷新可由 REST 恢复 |
| `provider_switched` toast | ✅ Phase 6.5 |
| `fork_chat` / media / transcription | ❌ Phase 8 |

### 4.4 Agent 核心

| 能力 | 状态 |
|------|------|
| `AgentLoop` + session lock + BusWorker | ✅ |
| `AgentRunner` ReAct + 流式 + abort | ✅ |
| 工具：filesystem / exec / web / memory / echo / weather / kb_* | ✅ |
| sync `spawn`（1.5A） | ✅ |
| async subagent（2.5） | ❌ |
| Memory / skills / compaction / context-usage | ✅ 3a/3b |
| Cron + Automations REST + UI | ✅ Phase 4 |
| MCP presets + Invoke + pipeline UI | ✅ Phase 5 |
| 工具权限确认 / 执行恢复 | ✅ HITL（`exec`、写入工具、MCP） |
| Long task / goal | ❌ Phase 12 |

### 4.5 Provider / 多模型

| 能力 | 状态 |
|------|------|
| `LLMProvider` 抽象 + OpenAI-compat（httpx） | ✅ |
| 流式 SSE | ✅ |
| Registry + Anthropic Messages | ✅ Phase 6 |
| 用户 Model presets + Settings（BYOK） | ✅ 6a；产品 WebUI「Your configs」可用 flag 关（`SETTINGS_SHOW_USER_MODEL_CONFIGS`） |
| 平台 builtin 多 slot + Models 单选 + activate API | ✅ Approach A（`platform_models.py`） |
| Auto：启动/激活时选 **catalog 中第一个有 key 的 slot** | ✅（不是失败时换模型） |
| `FallbackProvider` + preset.`fallback` | ✅ 6.5（见下表） |
| Runtime 故障注入（soft/429/5xx/timeout/conn） | ✅ Dev UI Insight |
| Azure / Bedrock / OAuth | stub |
| OpenAI `/v1/chat/completions` | ❌ Phase 7（**优先级最低，放最后**） |

**失败切换 / 重试（边界）：**

| 场景 | 行为 |
|------|------|
| 用户 preset 配置了 `fallback: [其他 presetId, …]` | ✅ 软错误 / 429 / 5xx / 超时 / 连接失败时切下一档；WS `provider_switched` |
| 同一模型自动退避重试（backoff） | ❌ 无独立重试层；失败即尝试 fallback 下一 slot（若有） |
| 平台 Auto / 平台 catalog 失败时换下一个平台模型 | ❌ **未接线**；Auto 只 `first_available`，`build_provider_chain` 的 fallback 列表只认 **preset id** |
| 手动在 UI 切换平台模型 / Auto / BYOK preset | ✅ |

### 4.6 Observability / KB

| 能力 | 状态 |
|------|------|
| Trace 页 + timing/usage | ✅ |
| mini-langfuse 旁路上报 | ✅（默认关） |
| `observability.html` | ❌ **取消**（用 mini-langfuse UI + `trace.html`） |
| minikb 客户端 + Knowledge UI | ✅ |

### 4.7 测试

`minibot/tests/` 按 Phase 分文件（streaming、mcp、cron、providers、fallback、langfuse、spawn、tools…）；本地：

```bash
cd minibot && .venv/bin/pytest -q
```

近期相关：`test_providers_phase6.py`、`test_fallback_phase65.py`、`test_platform_models.py`。

---

## 5. 当前热路径（实现事实）

```text
Dev UI / WS / REST turns
    → api/ws.py 或 sessions routes
    → MessageBus / AgentLoop（session lock）
    → AgentRunner.run / run_stream
    → build_provider_chain(AppConfig)
         → [FallbackProvider? 仅当 active preset 有 fallback] → OpenAICompat | Anthropic | …
         （平台 / Auto：单 primary，密钥来自 slot env）
    → ToolRegistry（builtin + MCP + kb）
    → SessionStore.append（JSONL）
    → 可选 Langfuse export；WS 推 delta / provider_switched / turn_end
```

---

## 6. 目录对照（源码）

```text
minibot/
  pyproject.toml
  README.md
  .env / .env.runtime / .env.models   # 本地（勿提交密钥；可 merge）
  src/minibot/
    main.py                 # FastAPI
    app_state.py            # DI：loop / bus / runner / mcp / cron / fallback_stats
    cli_chat.py
    config/                 # Settings + AppConfig + presets + mcp + platform_models
    api/                    # REST + WS
    agent/                  # loop, runner, context, memory, skills, tools/
    providers/              # base, openai_compat, anthropic, registry, factory, fallback
    session/                # JSONL store
    bus/                    # MessageBus + BusWorker
    cron/                   # Automations
    observability/          # Langfuse soft adapter
    knowledge/              # minikb client
    security/
    skills/
    static/devui/           # 内嵌 Insight UI
  tests/
```

---

## 7. 和迁移计划的衔接

1. **已完成至 MSV≈6.5 + 平台多 slot**（流式 + 多 provider + preset fallback + Approach A）；切换 nanobot WebUI 默认后端的门票仍见主计划（建议至少 MSV=2+6，正式切换 Phase 9）。
2. **下一主线：** Composer P0 / Phase 8 收尾。Phase 10 旁路已完成；`observability.html` 已取消。**Phase 7 `/v1` 放最后。**
3. **多端统一合同：** [`client-api.md`](./client-api.md)（CLI / webui / desktop / RN）。
4. Composer UX / media / long-goal 可穿插，但需短计划门槛的阶段不要整段抢跑。

改功能后请同步更新本文对应行，并以 [`migration.md`](./migration.md) checklist 为权威勾选源。
