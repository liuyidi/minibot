# minibot

[English](./README.md) | 简体中文

**minibot** 是一个本地优先的 **AI Agent 运行时**：用 FastAPI 承载「大模型 + 工具 + 会话」闭环，并用 React WebUI（及飞书 / 微信等 IM）与人对齐协作。

## 能做什么

| 能力 | 说明 |
|------|------|
| **Agent 对话** | WebSocket 流式回复；多会话；中途 Stop；侧边栏「对话 / 频道」分流 WebUI 与 IM |
| **多模型** | OpenAI 兼容 + Anthropic 等；平台内置模型与 BYOK preset；可选 preset 失败切换 |
| **工具执行** | 读写改文件、网页搜索/抓取 |
| **Exec 沙箱** | Shell/exec 支持 **本地** 或 **E2B** 云沙箱 |
| **MCP** | 接入 MCP（stdio / SSE / HTTP），工具注入 Agent Registry |
| **记忆** | 会话 JSONL、工作区 / Agent 记忆文件 |
| **上下文压缩** | 长对话摘要与裁剪，控制进模上下文长度 |
| **技能** | 内置与工作区 Skills，注入 Agent 上下文 |
| **子代理** | 已有同步 spawn；异步 / 后台 subagent 即将补齐 |
| **知识库** | 可选对接 [minikb](https://github.com/liuyidi/minikb) 检索工具 + Knowledge UI |
| **定时任务** | Cron / 自动化：按时触发 agent 回合 |
| **IM 频道** | 飞书、微信（iLink）扫码接入与配对 |
| **安全（HITL）** | 高风险工具先暂停，等人批准 / 拒绝（持久化 + REST / WS 卡片） |
| **可观测** | 可选对接 [mini-langfuse](https://github.com/liuyidi/mini-langfuse) 看 Trace / Session / 评分 |
| **多端入口** | **CLI**（`minibot`）、**Web**（本仓）、**Desktop**、**App**（[minibot-react-native](https://github.com/liuyidi/minibot-react-native)），同一套 REST + WS 协议 |

```text
  CLI / Web / Desktop / App / 飞书 / 微信
           │  REST + WebSocket
           ▼
     ┌─────────────┐
     │   minibot   │  Agent Loop → Runner → LLM / Tools
     │   :8766     │  Sessions · Memory · Skills · MCP · Cron · Sandbox
     └─────────────┘
           │
     ~/.minibot/   （配置、会话、工作区）
```

## 仓库结构

```text
minibot/              # Python 包（Agent、API、频道、工具）
webui/                # Vite + React SPA（构建 → webui/dist）
Dockerfile.minibot    # 运行时 + WebUI 一体镜像
docs/                 # 设计与分阶段文档
packages/             # 可选共享客户端包
```

## 快速开始

### 运行时

```bash
cd minibot
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[feishu,weixin]"
# 可选: export OPENAI_API_KEY=sk-...
minibot
```

- 健康检查：`http://127.0.0.1:8766/health`
- Dev UI：`http://127.0.0.1:8766/ui/`
- 打包后的 WebUI（有 `webui/dist` 或设置了 `MINIBOT_WEBUI_DIST`）：`http://127.0.0.1:8766/`

### WebUI 开发

```bash
cd webui
npm install
MINIBOT_API_URL=http://127.0.0.1:8766 npm run dev
```

开发服务器会把 `/api`、`/webui`、`/auth` 代理到运行时（默认 `:8766`）。

```bash
npm run build   # → webui/dist
npm test
```

### Docker

```bash
docker build -f Dockerfile.minibot -t minibot:local .
docker run --rm -p 8766:8766 \
  -e MINIBOT_SERVER_HOST=0.0.0.0 \
  -e MINIBOT_SERVER_OPENAI_API_KEY=sk-... \
  minibot:local
```

## 配置

配置层级：环境变量 → `~/.minibot/config.json` → 内存状态。

| 变量 | 默认 | 含义 |
|------|------|------|
| `MINIBOT_SERVER_HOST` | `127.0.0.1` | 监听地址 |
| `MINIBOT_SERVER_PORT` | `8766` | 端口 |
| `MINIBOT_SERVER_OPENAI_API_KEY` | — | 模型 Key（或 `OPENAI_API_KEY`） |
| `MINIBOT_SERVER_OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容 Base URL |
| `MINIBOT_SERVER_MODEL` | `gpt-4o-mini` | 默认模型 |
| `MINIBOT_SERVER_DATA_DIR` | `~/.minibot` | 数据目录 |
| `MINIBOT_WEBUI_DIST` | — | WebUI 构建目录 |
| `MINIBOT_SERVER_MINIKB_BASE_URL` | — | 可选知识库地址 |
| `MINIBOT_SERVER_EXEC_BACKEND` | `local` | `local` 或 `e2b` |
| `AUTH_SECRET` | 空 | 设置后 bootstrap 需要 `X-Minibot-Auth` |

模型预设、MCP、频道凭证在 WebUI **设置** / **IM 频道** 中管理。

更多细节：[`minibot/README.md`](./minibot/README.md)、[`webui/README.md`](./webui/README.md)、[`docs/`](./docs/)。

## 架构

```text
WebUI / IM 频道
  → API / WebSocket 总线
  → Agent Loop（上下文 + 会话锁）
  → Agent Runner（流式 + 工具调用）
  → Providers（OpenAI 兼容 / Anthropic / …）
  → Tools（文件系统、exec/沙箱、网页、MCP、知识库、cron）
  → 会话 JSONL + 记忆 + Skills
```

## 开发

```bash
cd minibot && pytest -q
cd minibot && ruff check src/minibot
cd webui && npm test
```

面向 Agent 的仓库说明见 [`AGENTS.md`](./AGENTS.md)。

## 许可

详见仓库内许可证文件。
