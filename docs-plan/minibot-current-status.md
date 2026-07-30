# minibot 现状分析（开工前基线）

> 生成日期：2026-07-23  
> 代码根：[`minibot/`](../minibot/)  
> 配套：[`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md)、[`minibot-core-impact.md`](./minibot-core-impact.md)

本文回答两件事：**已经实现了什么**，以及**配置文件在哪里**。

---

## 1. 一句话结论

minibot 已能作为 **本地 WebUI 聊天后端雏形**：bootstrap 鉴权、JSONL 持久会话、REST turn、WebSocket 整包回复、OpenAI-compat ReAct（echo / weather 工具）。  
**未接线**：MessageBus、AgentLoop、会话持久化、流式、真实 coding 工具、Automations / Skills / MCP、OpenAI `/v1`。

默认监听：`http://127.0.0.1:8766`。

---

## 2. 配置放在哪里？

minibot 有 **三层配置**，优先级大致为：

```text
环境变量 / .env  →  Settings（进程启动）
       ↓ 可覆盖默认值
~/.minibot/config.json  →  AppConfig（可被 Settings API 持久化）
       ↓ 运行时改模型/key
AppState.config + rebuild_provider()
```

### 2.1 环境变量 / `.env`（进程级）

| 项 | 说明 |
|----|------|
| **前缀** | `MINIBOT_SERVER_`（见 `minibot/config/settings.py`） |
| **加载文件** | 工作目录下的 `.env`（`SettingsConfigDict(env_file=".env")`）——通常是在 `minibot/` 下启动时读到 `minibot/.env` |
| **另支持** | 裸环境变量 `OPENAI_API_KEY`（当 `MINIBOT_SERVER_OPENAI_API_KEY` 为空时由 `resolved_api_key()` 回退） |

常用变量：

| 变量 | 默认 | 含义 |
|------|------|------|
| `MINIBOT_SERVER_HOST` | `127.0.0.1` | 绑定地址 |
| `MINIBOT_SERVER_PORT` | `8766` | 端口 |
| `MINIBOT_SERVER_OPENAI_API_KEY` | 空 | LLM Key |
| `MINIBOT_SERVER_OPENAI_BASE_URL` | `https://api.openai.com/v1` | 兼容 Base URL |
| `MINIBOT_SERVER_MODEL` | `gpt-4o-mini` | 默认模型 |
| `MINIBOT_SERVER_AUTH_SECRET` | 空 | 若设置，bootstrap 需带 `X-Nanobot-Auth` / `X-Minibot-Auth` |
| `MINIBOT_SERVER_REQUIRE_AUTH` | `false` | 强制校验 token |
| `MINIBOT_SERVER_TOKEN_TTL_S` | `86400` | bootstrap token 有效期 |
| `MINIBOT_SERVER_DATA_DIR` | `~/.minibot` | 数据根目录 |
| `MINIBOT_SERVER_CONFIG_PATH` | 空 | 若设则覆盖默认 config 路径 |
| `MINIBOT_SERVER_MAX_ITERATIONS` | `8` | ReAct 最大轮数 |
| `MINIBOT_SERVER_TEMPERATURE` | `0.2` | 温度 |

实现：[`minibot/src/minibot/config/settings.py`](../minibot/src/minibot/config/settings.py)。

### 2.2 持久化 JSON：`~/.minibot/config.json`

| 项 | 说明 |
|----|------|
| **默认路径** | `{data_dir}/config.json` → 通常是 **`~/.minibot/config.json`** |
| **可覆盖** | `MINIBOT_SERVER_CONFIG_PATH` 或 `Settings.config_path` |
| **读写** | `load_app_config` / `save_app_config`（Settings PATCH/update 会写盘并 `rebuild_provider`） |
| **沙箱回退** | `build_app_state()` 若无法创建 `data_dir`，会改用 **`./.minibot-data`**（当前工作目录下） |

`AppConfig` 字段（当前）：`model`, `provider`, `openai_api_key`, `openai_base_url`, `temperature`, `max_iterations`, `bot_name`, `timezone`。

实现：[`minibot/src/minibot/config/app_config.py`](../minibot/src/minibot/config/app_config.py)。

### 2.3 尚未落盘（重要缺口）

| 数据 | 现状 |
|------|------|
| **会话消息** | JSONL：`{data_dir}/sessions/<id>.jsonl`（默认 `~/.minibot/sessions/`）；内存为读缓存 |
| **Bootstrap token** | 内存 `AppState.tokens`，重启失效 |
| **sidebar / skills / automations** | API stub，无持久文件 |

### 2.4 与 nanobot 配置的关系

| | nanobot | minibot |
|--|---------|---------|
| 主配置 | `~/.nanobot/config.json` | `~/.minibot/config.json` |
| 是否互通 | — | **目前不读 nanobot 配置**（迁移计划里为可选导入） |

### 2.5 项目内其它文件

| 路径 | 作用 |
|------|------|
| `minibot/pyproject.toml` | 包元数据、依赖、入口 `minibot`、pytest `pythonpath=src` |
| `minibot/.env` | 本地密钥/环境（勿提交）；由 pydantic-settings 自动加载 |
| `minibot/.venv/` | 本地虚拟环境（`pip install -e .`） |
| `minibot/README.md` | 快速启动说明 |

---

## 3. 已实现功能清单

### 3.1 进程与入口

| 能力 | 状态 | 位置 |
|------|------|------|
| `minibot` / `python -m minibot` 启 uvicorn | 已实现 | `__main__.py` → `main:app` |
| FastAPI app + CORS + lifespan 建 `AppState` | 已实现 | `main.py` |
| 无 HTTP CLI 对话 | 已实现 | `cli_chat.py`（仍直调 `runner.run`） |
| **内嵌 Dev UI** `/ui/` | 已实现 | `static/devui/`；验证聊天/会话/settings/stub 探测，无需单独起 webui |
| 健康检查 | 已实现 | `GET /health` → `{status, runtime: minibot}` |

### 3.2 鉴权

| 能力 | 状态 | 说明 |
|------|------|------|
| `GET /auth/bootstrap`、`/webui/bootstrap` | 已实现 | 发 token、`ws_url`/`ws_path` |
| Bearer / `X-Minibot-Auth` / `X-Nanobot-Auth` / `?token=` | 已实现 | `api/deps.py` |
| `AUTH_SECRET` / `REQUIRE_AUTH` | 已实现 | 默认开发态可无 secret 也过（`check_token` 逻辑） |
| Pairing / 多用户 | 未做 | — |

### 3.3 会话 HTTP

| 路径 | 状态 |
|------|------|
| `GET/POST /api/sessions` | 已实现（JSONL 持久化） |
| `GET .../messages`、`.../webui-thread` | 已实现 |
| `DELETE` / `GET .../delete` | 已实现 |
| `POST .../turns` | 已实现（同步整包；直调 runner） |
| 会话磁盘持久化 | **未做** |
| file-preview / session automations | **未做** |

### 3.4 WebSocket `/ws`

| 能力 | 状态 |
|------|------|
| `new_chat` / `attach` / `message` | 已实现 |
| 整包 `message` + `turn_end` 类回复 | 已实现（见 `api/ws.py`） |
| token `delta` / reasoning 流式 | **未做** |
| `fork_chat` / media / transcription | **未做** |
| 经 MessageBus | **未做**（bus 已实例化但无消费者） |

### 3.5 Agent 核心

| 能力 | 状态 | 位置 |
|------|------|------|
| ReAct `AgentRunner`（LLM ↔ tools，最多 N 轮） | 已实现 | `agent/runner.py` |
| `AgentLoop` | **未做** | 入口直调 runner |
| System prompt | 硬编码 | `app_state.SYSTEM_PROMPT` |
| Tools：`echo`、`get_weather`（mock） | 已实现 | `agent/tools/` |
| filesystem / shell / web / MCP / cron 工具 | **未做** | — |
| Memory / skills / compaction | **未做** | — |

### 3.6 Provider

| 能力 | 状态 |
|------|------|
| OpenAI Chat Completions 兼容（httpx） | 已实现 |
| 流式 SSE | **未做** |
| Anthropic / Bedrock / OAuth 等多 provider | **未做** |
| Settings 改 key/base_url/model 后 rebuild | 已实现 |

### 3.7 Settings HTTP

| 能力 | 状态 |
|------|------|
| `GET/PATCH /api/settings`、`POST .../update` | 已实现（基础字段 + WebUI 兼容 payload 形状） |
| `provider/update`、`model-configurations/create` | 部分（写回 AppConfig） |
| `usage`、`provider-models`、`commands` | **stub**（空数据） |
| web-search / image / transcription / mcp-presets / cli-apps / oauth | **未做** |

### 3.8 其它 WebUI 兼容路由

| 路径 | 状态 |
|------|------|
| `/api/commands`、`/api/workspaces` | stub |
| `/api/webui/sidebar-state[+ /update]` | stub |
| `/api/webui/skills`、`/api/webui/automations` | stub |
| `/api/media/*`、OpenAI `/v1/*` | **未做** |

### 3.9 测试

| 能力 | 状态 |
|------|------|
| `tests/test_api.py` | health + bootstrap + 建 session + turns（turns 在无真实 key 时依赖 mock/失败行为需注意） |

---

## 4. 当前热路径（实现事实）

```text
WebUI / cli_chat
    → api/ws.py 或 api/routes/sessions.py 或 cli_chat.py
    → state.runner.run(messages, tools, model, system=SYSTEM_PROMPT)
    → OpenAICompatProvider.chat(...)
    → ToolRegistry（echo / weather）
    → state.sessions.append_messages（写 JSONL）
```

`MessageBus` 在 `AppState` 中创建，**没有任何 publish/consume 接到上述路径**。

---

## 5. 目录对照（源码）

```text
minibot/
  pyproject.toml          # 包与依赖
  README.md               # 快速开始
  .env                    # 本地环境（可选，勿提交密钥）
  src/minibot/
    main.py               # FastAPI
    app_state.py          # DI + SYSTEM_PROMPT
    cli_chat.py
    config/               # Settings + AppConfig
    api/                  # REST + WS
    agent/runner.py + tools/
    providers/openai_compat.py
    session/store.py      # JSONL + 内存缓存
    bus/                  # 脚手架未用
  tests/test_api.py
```

---

## 6. 和迁移计划的衔接

下一步按 [`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md)：

1. **0.1** ✅ 会话写入 `~/.minibot/sessions/`
2. **0.2–0.4** 引入 Loop + 入口改道 + Bus
3. 再扩工具 / 流式

本文仅描述 **当前仓库事实**；实现进度以代码与迁移计划为准，改功能后请同步更新本节对应行。
