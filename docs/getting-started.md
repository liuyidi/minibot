# Getting started

## 启动 minibot

```bash
cd minibot
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
# export OPENAI_API_KEY=sk-...   # 或 MINIBOT_SERVER_OPENAI_API_KEY
minibot
```

- API / Dev UI：`http://127.0.0.1:8766`
- Dev UI Chat：`http://127.0.0.1:8766/ui/`
- 健康检查：`GET /health` → `{ "runtime": "minibot" }`

常用环境变量见 [`status.md`](./status.md) §配置。包内说明见 [`minibot/README.md`](../minibot/README.md)。

## 产品 WebUI（Vite）

```bash
# 终端 1：minibot 已在 :8766
# 终端 2：
cd webui
bun install
bun run dev    # http://127.0.0.1:5173
```

默认把 `/api` `/auth` `/webui` 代理到 `http://127.0.0.1:8766`（可用 `MINIBOT_API_URL` 覆盖）。合同见 [`client-api.md`](./client-api.md)。

## 下一步

- 看现状：[`status.md`](./status.md)
- 看路线图：[`migration.md`](./migration.md)
- 接移动端 / 多端：[`client-api.md`](./client-api.md)
