---
name: aliyun-ecs-demo-deploy
description: >-
  Publish and deploy the liuyidi.me interview demo stack on Aliyun ECS
  (mini-langfuse + minibot WebUI + optional minikb). Use when the user
  asks to 发布、部署、重建镜像、更新 ECS、up.sh、bot.liuyidi.me、mlf.liuyidi.me、
  kb.liuyidi.me、demo-minibot、demo-minikb, or to ship local commits to the live
  demo server.
---

# Aliyun ECS Demo Deploy（liuyidi.me）

三件套面试 Demo：

| 域名 | 服务 | 本机端口（宿主机） |
|------|------|-------------------|
| https://mlf.liuyidi.me | mini-langfuse | 8080 → web, 8000 → API |
| https://bot.liuyidi.me | minibot + WebUI | 8766 |
| https://kb.liuyidi.me | minikb（Volcengine，经本机 nginx） | 反代 → 101.96.224.232:80 |

ECS：`root@116.62.35.76`，密钥 `~/Downloads/agent.pem`，代码根 `/opt/demo/`。

```text
/opt/demo/
  mini-langfuse/     # compose 在 deploy/demo/
  minibot/           # monorepo（Dockerfile.minibot + webui/ + minibot/）
# minikb lives on Volcengine (/opt/minikb), not under /opt/demo
```

Compose 入口：`/opt/demo/mini-langfuse/deploy/demo/`（`.env`、`docker-compose.yml`、`up.sh`）。

更完整的踩坑实录：`mini-langfuse/docs/aliyun-ecs-demo-deploy.md`、`deploy/demo/GUIDE-liuyidi.me.md`。

## 何时用哪条路径

1. **只改了 minibot / WebUI 代码** → 拉 `minibot` monorepo + 重建 `minibot` 镜像
2. **只改了 minikb** → 走 minikb 仓 `publish-volcengine-minikb.yml`（不要在本机 compose 起 kb）
3. **改了 compose / Langfuse** → 拉 `mini-langfuse` + `./up.sh core` 或针对性 recreate
4. **kb 域名 / 反代** → 更新 `nginx-subdomains.conf` 中 `upstream demo_kb` 后 reload nginx

## 发布前（本机）

```bash
# 各仓 commit + push main（或用户指定分支）
cd <repo> && git status && git push origin HEAD
```

相关仓远程习惯：

- minibot：`github.com:liuyidi/minibot.git`
- mini-langfuse：`github.com:liuyidi/mini-langfuse`（或当前 origin）
- minikb：`github.com:liuyidi/minikb`

ECS 拉 GitHub 常用镜像：`https://ghfast.top/https://github.com/...`（若直连慢）。

## SSH

```bash
chmod 600 ~/Downloads/agent.pem
ssh -i ~/Downloads/agent.pem -o StrictHostKeyChecking=no root@116.62.35.76
```

所有远程操作默认 `required_permissions: ["all"]`（密钥 + 网络）。

## A. 更新 minibot（最常见）

WebUI 打进镜像：`Dockerfile.minibot` 多阶段构建 `webui/` → `/app/webui-dist`。  
**必须 `--build` 重建**；只 `git pull` 不会更新正在跑的容器。

```bash
ssh -i ~/Downloads/agent.pem -o StrictHostKeyChecking=no root@116.62.35.76 'set -euo pipefail
cd /opt/demo/minibot
git fetch origin main
git reset --hard origin/main   # 避免本地脏文件挡 pull；确认无未提交热修再硬重置
git rev-parse --short HEAD

cd /opt/demo/mini-langfuse/deploy/demo
set -a; source .env; set +a
export MINIBOT_REPO_DIR=/opt/demo/minibot
export MLF_DIR=/opt/demo/mini-langfuse

# 只要 minibot：避免顺带 rebuild server（DaoCloud 偶发 EOF）
docker compose -f docker-compose.yml --env-file .env build minibot
docker compose -f docker-compose.yml --env-file .env up -d minibot

sleep 2
curl -fsS http://127.0.0.1:8766/health
curl -fsS -o /dev/null -w "webui %{http_code}\n" http://127.0.0.1:8766/
'
```

侧边栏 / UI 开关（`webui/src/lib/ui-entry.ts`）是**编译期常量**：改完必须重建镜像，浏览器硬刷新（Cmd+Shift+R）。

WebUI 静态有变更且怀疑缓存层：

```bash
docker compose ... build --no-cache minibot
```

## B. minikb（kb.liuyidi.me）

minikb **不在** Aliyun demo compose。发布：`minikb` 仓库 workflow `Publish Volcengine Minikb`。

阿里云 Nginx：`upstream demo_kb { server 101.96.224.232:80; }`（见 `deploy/demo/nginx-subdomains.conf`），
模板副本：`minikb/deploy/nginx.kb.liuyidi.me.conf.example`。

验收：`curl -fsS https://kb.liuyidi.me/health`

## C. 全量 core（Langfuse + minibot）

```bash
cd /opt/demo/mini-langfuse/deploy/demo
# 按需 pull mini-langfuse / minibot
./up.sh core
```

## 本地改 compose 后同步到 ECS

ECS 上 git 可能落后或未提交热修。可靠做法：

```bash
scp -i ~/Downloads/agent.pem \
  deploy/demo/docker-compose.yml \
  deploy/demo/Dockerfile.minikb \
  root@116.62.35.76:/opt/demo/mini-langfuse/deploy/demo/

# Dockerfile 必须在 build context 内：
scp -i ~/Downloads/agent.pem \
  deploy/demo/Dockerfile.minikb \
  root@116.62.35.76:/opt/demo/minikb/docker/Dockerfile.ecs
```

Compose 里 `dockerfile:` 相对 **build context**（`MINIKB_DIR`），不是 compose 文件目录。

## 验收清单

```bash
curl -fsS http://127.0.0.1:8000/health          # langfuse API
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
curl -fsS http://127.0.0.1:8766/health            # minibot
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8766/
curl -fsS http://127.0.0.1:8081/health            # minikb（若已起）

curl -fsS -o /dev/null -w "mlf %{http_code}\n" https://mlf.liuyidi.me/
curl -fsS -o /dev/null -w "bot %{http_code}\n" https://bot.liuyidi.me/
curl -fsS https://kb.liuyidi.me/health            # 可选
```

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
free -h   # 2C2G：起 kb 后 available 变紧，应有 /swapfile
```

## 常见坑（必读）

| 现象 | 原因 / 处理 |
|------|-------------|
| 侧边栏仍显示已隐藏入口 | WebUI 未重建或浏览器缓存；重建 minibot + 硬刷新 |
| 每开页面多一条空对话 | 旧 bug：WS connect 时 `sessions.create()`；需含 `ef1b90f` 之后的 minibot |
| 回复打两遍 | 流式后又发全文 `message`；需 `_streamed` 跳过逻辑 |
| `HTTP 402 Insufficient Balance` | DeepSeek 余额不足；与 cron 无关（空 jobs 不会烧 token） |
| `Could not load automations` | WebUI 打 `/api/sessions/.../automations`，minibot 可能 404；弹窗错误，不堵聊天 |
| `./up.sh kb` 建镜像失败 `open Dockerfile.minikb` | dockerfile 路径不在 context；用 `docker/Dockerfile.ecs` |
| build 拉 `python:*` EOF | DaoCloud 偶发；重试，或只 build 目标服务 |
| minikb DB 不存在 | 对已有 PG volume 手动 `CREATE DATABASE minikb` |
| OOM / 反复重启 | 确认 swap；先 `core` 再 `kb` |
| GitHub clone/pull 超时 | `ghfast.top` / `gitclone.com` 镜像 |

## Agent 操作约定

1. 先 `git status` / `git log` 确认本机已 push，再 SSH 拉代码。
2. 优先**最小重建**（只 `build` + `up -d` 变更服务），避免无故重建 postgres。
3. 日志：`docker logs demo-minibot --tail 100`、`demo-minikb`、`demo-mlf-server`。
4. **不要**把 `.env`、API Key、pem 写入 commit 或 skill 正文以外的仓库文件。
5. 部署完成后用上表 curl 验收，并告诉用户可硬刷新浏览器。

## 快速口令（复制）

```bash
# minibot 热更新
PEM=~/Downloads/agent.pem
HOST=root@116.62.35.76
ssh -i "$PEM" -o StrictHostKeyChecking=no "$HOST" \
  'cd /opt/demo/minibot && git fetch origin main && git reset --hard origin/main && \
   cd /opt/demo/mini-langfuse/deploy/demo && set -a && source .env && set +a && \
   export MINIBOT_REPO_DIR=/opt/demo/minibot MLF_DIR=/opt/demo/mini-langfuse && \
   docker compose -f docker-compose.yml --env-file .env build minibot && \
   docker compose -f docker-compose.yml --env-file .env up -d minibot && \
   curl -fsS http://127.0.0.1:8766/health'
```
