---
name: aliyun-ecs-demo-deploy
description: >-
  Publish and deploy minibot + liuyidi.me landing on Aliyun ECS
  (bot.liuyidi.me / apex landing / kb reverse proxy). Use when the user
  asks to 发布、部署、重建镜像、更新 ECS、up.sh、bot.liuyidi.me、
  liuyidi.me、demo-minibot, or to ship local minibot commits to the live
  demo server. For mlf.liuyidi.me use the mini-langfuse Tencent skill instead.
---

# Aliyun ECS Deploy（minibot only）

本机只跑 **minibot + 落地页**；mlf 在腾讯云。

| 域名 | 服务 | 本机 |
|------|------|------|
| https://liuyidi.me | 静态落地页 | `deploy/landing/` |
| https://bot.liuyidi.me | minibot + WebUI | `:8766` |
| https://kb.liuyidi.me | minikb（Volcengine） | nginx 反代 `101.96.224.232:80` |
| https://mlf.liuyidi.me | mini-langfuse | **腾讯云**（不要在本机起） |

ECS：`root@116.62.35.76`，密钥 `~/Downloads/agent.pem`，代码根 `/opt/demo/`。

```text
/opt/demo/
  minibot/           # compose 在 deploy/（唯一启动路径）
  mini-langfuse/     # 仅构建镜像时提供 sdk-python（LANGFUSE_SDK_DIR）
```

Compose 入口：`/opt/demo/minibot/deploy/`（`.env`、`docker-compose.yml`、`up.sh`）。

## 何时用哪条路径

1. **只改了 minibot / WebUI** → 拉 `minibot` + `./up.sh`（或只 `build` + `up -d minibot`）
2. **只改了 minikb** → minikb 仓 `publish-volcengine-minikb.yml`
3. **改了 mlf** → 腾讯云 / mini-langfuse `deploy/`（不要碰阿里云 compose）
4. **kb 反代** → 改 `deploy/nginx.liuyidi.me.conf.example` 中 `upstream demo_kb` 后 reload nginx

## SSH

```bash
chmod 600 ~/Downloads/agent.pem
ssh -i ~/Downloads/agent.pem -o StrictHostKeyChecking=no root@116.62.35.76
```

远程操作默认 `required_permissions: ["all"]`。

## 更新 minibot（最常见）

WebUI 打进镜像：`Dockerfile.minibot`。必须 `--build`。

```bash
ssh -i ~/Downloads/agent.pem -o StrictHostKeyChecking=no root@116.62.35.76 'set -euo pipefail
cd /opt/demo/minibot
git fetch origin main
git reset --hard origin/main
git rev-parse --short HEAD

cd /opt/demo/minibot/deploy
# 不要 bash source .env（SCOPE 含空格会炸）
export LANGFUSE_SDK_DIR=/opt/demo/mini-langfuse/sdk-python
docker compose -f docker-compose.yml --env-file .env build minibot
docker compose -f docker-compose.yml --env-file .env up -d minibot

sleep 2
curl -fsS http://127.0.0.1:8766/health
curl -fsS -o /dev/null -w "webui %{http_code}\n" http://127.0.0.1:8766/
'
```

## 验收

```bash
curl -fsS http://127.0.0.1:8766/health
curl -fsS -o /dev/null -w "landing %{http_code}\n" https://liuyidi.me/
curl -fsS -o /dev/null -w "bot %{http_code}\n" https://bot.liuyidi.me/
curl -fsS https://kb.liuyidi.me/health
curl -fsS -o /dev/null -w "mlf %{http_code}\n" https://mlf.liuyidi.me/
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## 常见坑

| 现象 | 处理 |
|------|------|
| `source .env` 报 `profile: command not found` | 用 `--env-file`，不要 source |
| 构建缺 langfuse_sdk | 确认 `/opt/demo/mini-langfuse/sdk-python` 存在 |
| 会话数据丢了 | `.env` 里 `MINIBOT_DATA_VOLUME=agent-demo_demo_minibot` |
| 侧边栏仍旧 | 重建镜像 + 浏览器硬刷新 |
| 误起 mlf | 阿里云不要再 `up` mini-langfuse；mlf 只在腾讯云 |

## 快速口令

```bash
PEM=~/Downloads/agent.pem
HOST=root@116.62.35.76
ssh -i "$PEM" -o StrictHostKeyChecking=no "$HOST" \
  'cd /opt/demo/minibot && git fetch origin main && git reset --hard origin/main && \
   cd deploy && export LANGFUSE_SDK_DIR=/opt/demo/mini-langfuse/sdk-python && \
   docker compose -f docker-compose.yml --env-file .env build minibot && \
   docker compose -f docker-compose.yml --env-file .env up -d minibot && \
   curl -fsS http://127.0.0.1:8766/health'
```
