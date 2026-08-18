---
name: aliyun-ecs-demo-deploy
description: >-
  Use when the user asks to 发布、部署、重建镜像、更新 ECS、up.sh、
  bot.liuyidi.me、liuyidi.me、demo-minibot, or to ship minibot / site /
  WebUI commits to Aliyun ECS. Not for mlf.liuyidi.me, minikb app
  publish, auth.liuyidi.me, or serverless-ship.liuyidi.me.
---

# Aliyun ECS Deploy（只 minibot + 落地页）

应用已经拆开，**先选仓**。本 skill 只覆盖第一行；其它域名立刻换仓读对应 skill，不要在本机 compose 里起别的应用。

| 域名 | 仓 | 云 | Skill |
|------|----|----|-------|
| `liuyidi.me` / `bot.liuyidi.me` | minibot | 阿里云 ECS `root@116.62.35.76` | **本文件** |
| `kb.liuyidi.me` | minikb | 火山引擎 `101.96.224.232`（本机 nginx 只 TLS 反代） | minikb `deploying-volcengine-minikb` |
| `mlf.liuyidi.me` | mini-langfuse | 腾讯云 `ubuntu@124.223.108.72` | mini-langfuse `deploying-tencent-mlf` |
| `auth.liuyidi.me` | mini-auth | 腾讯云 CVM | mini-auth `deploying-tencent-mini-auth` |
| `serverless-ship.liuyidi.me` | serverless-ship | Vercel | serverless-ship `deploying-vercel-serverless-ship` |

ECS 密钥 `~/Downloads/agent.pem`，代码 `/opt/demo/minibot/`。  
`/opt/demo/mini-langfuse/` **只给构建** `sdk-python`（`LANGFUSE_SDK_DIR`），不要在阿里云再起 mlf。

Compose 入口：`/opt/demo/minibot/deploy/`（`.env`、`docker-compose.yml`、`up.sh`）。

## 何时用哪条路径

1. **只改了 minibot / WebUI** → 拉 `minibot` + `./up.sh`（或 `build` + `up -d minibot`）。必须 `--build`（WebUI 打进 `Dockerfile.minibot`）。
2. **改了 `site/` 或 `CHANGELOG.zh.md`（liuyidi.me）** → 拉代码 + `deploy/build-site.sh`；nginx 片段变了再 `nginx -t && reload`。
3. **只改 kb 反代** → 改 `deploy/nginx.liuyidi.me.conf.example` 的 `upstream demo_kb` 后 reload。不要去火山引擎乱 SSH，除非用户明确要动 minikb 应用。
4. **改了 minikb / mlf / auth / serverless-ship** → 换仓，读上表 skill。不要碰阿里云 compose。

## SSH

```bash
chmod 600 ~/Downloads/agent.pem
ssh -i ~/Downloads/agent.pem -o StrictHostKeyChecking=no root@116.62.35.76
```

远程操作默认 `required_permissions: ["all"]`。

## 更新 minibot（最常见）

```bash
ssh -i ~/Downloads/agent.pem -o StrictHostKeyChecking=no root@116.62.35.76 'set -euo pipefail
cd /opt/demo/minibot
git fetch origin main
git reset --hard origin/main
git rev-parse --short HEAD

/opt/demo/minibot/deploy/build-site.sh

cd /opt/demo/minibot/deploy
# 不要 bash source .env（SCOPE 含空格会炸）
export LANGFUSE_SDK_DIR=/opt/demo/mini-langfuse/sdk-python
docker compose -f docker-compose.yml --env-file .env build minibot
docker compose -f docker-compose.yml --env-file .env up -d minibot

sleep 2
curl -fsS http://127.0.0.1:8766/health
curl -fsS -o /dev/null -w "webui %{http_code}\n" http://127.0.0.1:8766/
curl -fsS -o /dev/null -w "landing %{http_code}\n" https://liuyidi.me/
curl -fsS -o /dev/null -w "overview %{http_code}\n" https://liuyidi.me/minibot/
curl -fsS -o /dev/null -w "changelog %{http_code}\n" https://liuyidi.me/minibot/changelog/
curl -fsS -o /dev/null -w "bot %{http_code}\n" https://bot.liuyidi.me/
'
```

## 验收

本仓部署只验 landing + bot。跨应用冒烟是可选的，失败不要在本机 `up` 别人的栈。

```bash
curl -fsS http://127.0.0.1:8766/health
curl -fsS -o /dev/null -w "landing %{http_code}\n" https://liuyidi.me/
curl -fsS -o /dev/null -w "bot %{http_code}\n" https://bot.liuyidi.me/
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
# 可选：curl -fsS https://kb.liuyidi.me/health
# 可选：curl -fsS -o /dev/null -w "mlf %{http_code}\n" https://mlf.liuyidi.me/
# 可选：curl -fsS https://auth.liuyidi.me/health
```

## 常见坑

| 现象 | 处理 |
|------|------|
| `source .env` 报 `profile: command not found` | 用 `--env-file`，不要 source |
| 构建缺 langfuse_sdk | 确认 `/opt/demo/mini-langfuse/sdk-python` 存在（只克隆 SDK，不起 mlf） |
| 会话数据丢了 | `.env` 里 `MINIBOT_DATA_VOLUME=agent-demo_demo_minibot` |
| 侧边栏仍旧 | 重建镜像 + 浏览器硬刷新 |
| 误起 mlf / minikb / auth | 阿里云 compose 只有 minibot；换仓发其它应用 |
| `/minibot/` 仍是门户 | nginx 还在 `deploy/landing` 且 SPA 回退；切到 `site/.vitepress/dist` 并无 `try_files … /index.html` |

## 快速口令

```bash
PEM=~/Downloads/agent.pem
HOST=root@116.62.35.76
ssh -i "$PEM" -o StrictHostKeyChecking=no "$HOST" \
  'cd /opt/demo/minibot && git fetch origin main && git reset --hard origin/main && \
   ./deploy/build-site.sh && \
   cd deploy && export LANGFUSE_SDK_DIR=/opt/demo/mini-langfuse/sdk-python && \
   docker compose -f docker-compose.yml --env-file .env build minibot && \
   docker compose -f docker-compose.yml --env-file .env up -d minibot && \
   curl -fsS http://127.0.0.1:8766/health'
```
