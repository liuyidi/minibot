# minibot 现状（进度快照）

> 更新日期：2026-08-05  
> 代码根：[`minibot/`](../minibot/)  
> 主计划：[`migration.md`](./migration.md)  

本文回答三件事：**已经实现了什么**、**配置在哪里**、**下一刀是什么**。细节以代码与迁移计划 checklist 为准。

---

## 1. 一句话结论

minibot 已是可本地跑通的 **FastAPI agent 运行时 + 内嵌 Dev UI**：

- 鉴权 bootstrap、JSONL 会话、**AgentLoop + MessageBus**、ReAct Runner
- **流式** delta / reasoning / Stop；真实 coding 工具 + MCP + cron + memory/skills + compaction
- **多 provider**：registry、OpenAI-compat、Anthropic Messages、model presets、**Fallback 链（6.5）**
- mini-langfuse **软依赖旁路**（默认关）；minikb 只读转发 + Knowledge Dev UI
- **已实现的安全暂停**：高风险工具 HITL 审批（持久化、REST / WS、Dev UI / WebUI 卡片）
- **未做 / 待做主线**：OpenAI `/v1`（Phase 7）、正式切换 WebUI 默认后端（Phase 9）；Composer / Phase 8 可穿插

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
  Phase 6.5 Fallback / Retry（toast + runtime stats）
  KB Dev UI（minikb 转发）
  Phase 11 核心 HITL

【下一刀】
  ① Phase 7        /v1 chat completions
  ② Composer P0 小插队 / Phase 8 media / Phase 12（短计划）…
```

阶段笔记：[`phases/`](./phases/)。统一客户端合同：[`client-api.md`](./client-api.md)。

---

## 3. 配置放在哪里？

三层配置，优先级大致：

```text
环境变量 / .env  →  Settings（进程启动）
       ↓ 可覆盖默认值
~/.minibot/config.json  →  AppConfig（Settings API 持久化）
       ↓ 运行时改模型 / preset / MCP
AppState.config + rebuild_provider() / MCP reconnect
```

### 3.1 环境变量 / `.env`（进程级）

| 项 | 说明 |
|----|------|
| **前缀** | `MINIBOT_SERVER_`（`minibot/config/settings.py`） |
| **加载文件** | 工作目录 `.env`（通常在 `minibot/` 下启动） |
| **另支持** | 裸 `OPENAI_API_KEY`（当 `MINIBOT_SERVER_OPENAI_API_KEY` 为空时回退） |

常用变量：

| 变量 | 默认 | 含义 |
|------|------|------|
| `MINIBOT_SERVER_HOST` / `PORT` | `127.0.0.1` / `8766` | 绑定 |
| `MINIBOT_SERVER_OPENAI_API_KEY` | 空 | LLM Key |
| `MINIBOT_SERVER_OPENAI_BASE_URL` | `https://api.openai.com/v1` | 兼容 Base URL |
| `MINIBOT_SERVER_MODEL` | `gpt-4o-mini` | 默认模型 |
| `MINIBOT_SERVER_AUTH_SECRET` | 空 | 设置后 bootstrap 需带 auth header |
| `MINIBOT_SERVER_REQUIRE_AUTH` | `false` | 强制校验 token |
| `MINIBOT_SERVER_DATA_DIR` | `~/.minibot` | 数据根 |
| `MINIBOT_SERVER_CONFIG_PATH` | 空 | 覆盖默认 config 路径 |
| `MINIBOT_SERVER_MAX_ITERATIONS` / `TEMPERATURE` | `8` / `0.2` | ReAct / 采样 |
| `MINIBOT_SERVER_LANGFUSE_*` | 默认关 | mini-langfuse 旁路 |
| `MINIBOT_SERVER_MINIKB_*` | 空 | 启用 kb_* 工具与 Knowledge 页 |

### 3.2 持久化 JSON：`~/.minibot/config.json`

| 项 | 说明 |
|----|------|
| **默认路径** | `{data_dir}/config.json` → 通常 **`~/.minibot/config.json`** |
| **读写** | `load_app_config` / `save_app_config`；改 settings / preset 会写盘并 `rebuild_provider` |
| **沙箱回退** | 无法创建 `data_dir` 时用 `./.minibot-data` |

`AppConfig` 主要字段：`model`、`provider`、`openai_api_key`、`openai_base_url`、`temperature`、`max_iterations`、compaction 相关、`active_preset`、`model_presets`（含 `fallback: [presetId,…]`）、`mcp_presets`。

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

### 4.5 Provider

| 能力 | 状态 |
|------|------|
| `LLMProvider` 抽象 + OpenAI-compat（httpx） | ✅ |
| 流式 SSE | ✅ |
| Registry + Anthropic Messages | ✅ Phase 6 |
| Model presets + Settings 侧栏 | ✅ 6a |
| `FallbackProvider` + preset.`fallback` | ✅ 6.5 |
| Runtime 故障注入（soft/429/5xx/timeout/conn） | ✅ Dev UI Insight |
| Azure / Bedrock / OAuth | stub |
| OpenAI `/v1/chat/completions` | ❌ Phase 7 |

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

近期相关：`test_providers_phase6.py`、`test_fallback_phase65.py`。

---

## 5. 当前热路径（实现事实）

```text
Dev UI / WS / REST turns
    → api/ws.py 或 sessions routes
    → MessageBus / AgentLoop（session lock）
    → AgentRunner.run / run_stream
    → build_provider_chain(AppConfig)
         → [FallbackProvider?] → OpenAICompat | Anthropic | …
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
  .env                      # 本地（勿提交密钥）
  src/minibot/
    main.py                 # FastAPI
    app_state.py            # DI：loop / bus / runner / mcp / cron / fallback_stats
    cli_chat.py
    config/                 # Settings + AppConfig + presets + mcp
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

1. **已完成至 MSV≈6.5**（流式 + 多 provider + fallback）；切换 nanobot WebUI 默认后端的门票仍见主计划（建议至少 MSV=2+6，正式切换 Phase 9）。
2. **下一主线：** Phase 7 `/v1`。Phase 10 旁路已完成；`observability.html` 已取消。
3. **多端统一合同：** [`client-api.md`](./client-api.md)（CLI / webui / desktop / RN）。
4. Composer UX / media / long-goal 可穿插，但需短计划门槛的阶段不要整段抢跑。

改功能后请同步更新本文对应行，并以 [`migration.md`](./migration.md) checklist 为权威勾选源。
