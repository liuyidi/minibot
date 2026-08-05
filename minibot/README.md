# minibot

FastAPI agent runtime

## Layout

```text
minibot/
  pyproject.toml
  src/minibot/     # import package
  tests/
```

## Quick start

```bash
cd minibot
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
# optional: export OPENAI_API_KEY=sk-...
minibot
# or: python -m minibot
```

Default listen: `http://127.0.0.1:8766`

### Docker

Standalone image (no langfuse SDK). For the interview demo stack that wires
langfuse + minikb, use `mini-langfuse/deploy/demo` instead.

```bash
docker build -t minibot .
docker run --rm -p 8766:8766 \
  -e MINIBOT_SERVER_HOST=0.0.0.0 \
  -e MINIBOT_SERVER_OPENAI_API_KEY=sk-... \
  minibot
```

### 平台内置模型（`.env.models`）

运营方密钥按 slot 写在 env（见 `.env.models.example`），WebUI Settings → Models 显示为 platform models；**密钥不进** `config.json`。  
多数槽位走 **OpenAI-compat**；`doubao` 走 **Anthropic Messages**。  
**Auto** = catalog 里第一个有 key 的 slot（启动时选定），**不是**请求失败后再换平台模型。

推荐拆分后合并：

```bash
cp .env.runtime.example .env.runtime
cp .env.models.example .env.models   # 填入各 SLOT 的 KEY/BASE/MODEL
./scripts/merge-env.sh               # → .env（gitignore）
```

部署到 ECS 时把合并结果写入 compose `.env`，或把 `.env.models` 挂到 `MINIBOT_SERVER_DATA_DIR`。

### 多 LLM（用户 preset）+ 失败切换

仍可在 Settings 新建 BYOK preset（OpenAI-compat / Anthropic），切换后下一轮生效。  
在 preset 上配置 `fallback: ["backup-preset-id", …]` 后，软错误 / 429 / 5xx / 超时 / 连接失败会切下一档（Phase 6.5 `FallbackProvider`，WS `provider_switched`）。  
**没有**同模型 backoff 重试；平台 Auto **不会**用这套链。

```bash
# 或用 API
curl -X POST http://127.0.0.1:8766/api/settings/model-configurations \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"openai","label":"OpenAI","model":"gpt-4o-mini","api_base":"https://api.openai.com/v1","api_key":"sk-..."}'
curl -X POST http://127.0.0.1:8766/api/settings/model-configurations/openai/activate \
  -H "Authorization: Bearer $TOKEN"
```

用户 preset 落在 `~/.minibot/config.json` 的 `model_presets` / `active_preset`。

### MCP presets（Phase 5）

实验室页 `/ui/mcp.html`：增改 MCP preset（stdio / SSE / HTTP），Test / Enable 后 tools 注入 Registry（`mcp_<id>_<tool>`）。断连或坏配置只记错误，不崩 Loop。

```bash
curl -X POST http://127.0.0.1:8766/api/settings/mcp-presets \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"fs","label":"Filesystem","type":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"],"enabled":true}'
```

### mini-langfuse（可选）

把真实 agent 回合上报到本地 [mini-langfuse](https://github.com/liuyidi/mini-langfuse)：

```bash
pip install -e /path/to/mini-langfuse/sdk-python
# .env
MINIBOT_SERVER_LANGFUSE_ENABLED=true
MINIBOT_SERVER_LANGFUSE_HOST=http://localhost:8000
MINIBOT_SERVER_LANGFUSE_PUBLIC_KEY=pk-lf-demo
MINIBOT_SERVER_LANGFUSE_SECRET_KEY=sk-lf-demo
```

先启动 mini-langfuse（API `:8000` / UI `:5173`），再启动 minibot；打一轮对话后在 Langfuse UI 的 Traces / Sessions / Prompts 查看。Chat 下方可对最近一轮 👍/👎 打分。

### LLM 日限额熔断（可选）

按 **UTC 自然日**累计 turns / tokens；超限后拒绝新对话，并跳过 cron。

```bash
# .env — 0 表示该维度不限
MINIBOT_SERVER_DAILY_TURN_LIMIT=50
MINIBOT_SERVER_DAILY_TOKEN_LIMIT=200000
```

查看用量：`GET /api/settings/usage`（含 `by_entry`：`ws` / `cron` / `rest` / …）。超限返回 HTTP 429。计数落在 `$MINIBOT_SERVER_DATA_DIR/usage/YYYY-MM-DD.json`。

### E2B exec 沙箱（可选）

默认 `local`（工作区 cwd + 可选 bwrap）。设为 `e2b` 后，`exec` 在 Firecracker microVM 里跑；文件读写仍在本机 workspace。

```bash
pip install -e ".[e2b]"
# .env
MINIBOT_SERVER_EXEC_BACKEND=e2b
MINIBOT_SERVER_E2B_API_KEY=e2b_...   # 或 E2B_API_KEY=
```

国内可直连 `api.e2b.app`（有跨境延迟）；请在 E2B Dashboard 设 spend limit。Hobby 有一次性用量额度。

### 飞书频道（Phase 15）

支持 **扫码一键创建机器人**（飞书 `lark.register_app` / Device Authorization）与 **配对管理**。

```bash
pip install -e ".[feishu]"
minibot
# WebUI → 设置 → Channels → 飞书 → 配置 → 扫码 → 保存
```

也可手填 env（跳过扫码）：

```bash
MINIBOT_SERVER_FEISHU_ENABLED=true
MINIBOT_SERVER_FEISHU_APP_ID=cli_...
MINIBOT_SERVER_FEISHU_APP_SECRET=...
```

扫码保存后凭证写入 `config.json` 的 `feishu`；默认 `dm_policy=pairing`。微信通道尚未迁入。

Default **workspace** (tools / `SOUL.md` / `USER.md`): `~/.minibot/workspace`
(override with Chat workspace switch, or set `MINIBOT_SERVER_DATA_DIR`).
Sessions live under `~/.minibot/sessions/`.

**Built-in Dev UI** (no separate frontend build): open
[`http://127.0.0.1:8766/ui/`](http://127.0.0.1:8766/ui/) after starting `minibot`.
Chat lives there; LLM/tool execution traces open in a dedicated page
[`/ui/trace.html`](http://127.0.0.1:8766/ui/trace.html) (auto-syncs when you send messages).
High-risk tool calls pause for review; inspect and resolve them from
[`/ui/approvals.html`](http://127.0.0.1:8766/ui/approvals.html).

Baseline of what is already implemented and where config files live:
[`docs/status.md`](../docs/status.md).

```bash
curl http://127.0.0.1:8766/health
```

## CLI agent (no HTTP)

```bash
cd minibot && python -m minibot.cli_chat
```

## Env vars (`MINIBOT_SERVER_` prefix)

| Variable | Default | Meaning |
|----------|---------|---------|
| `HOST` | `127.0.0.1` | Bind host |
| `PORT` | `8766` | Bind port |
| `OPENAI_API_KEY` | — | LLM key (or use `OPENAI_API_KEY`) |
| `OPENAI_BASE_URL` | OpenAI | Compatible base URL |
| `MODEL` | `gpt-4o-mini` | Default model |
| `AUTH_SECRET` | empty | If set, bootstrap requires `X-Minibot-Auth` |
| `REQUIRE_AUTH` | `false` | Force token checks |

See [docs/client-api.md](../docs/client-api.md) for the unified REST + WebSocket contract outline.
See [docs/human-in-the-loop.md](../docs/human-in-the-loop.md) for the HITL approval contract and UI flow.
See [docs/server.md](../docs/server.md) 
