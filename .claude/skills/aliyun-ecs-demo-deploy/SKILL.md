---
name: aliyun-ecs-demo-deploy
description: >-
  Use when the user asks to 发布、部署、重建镜像、更新 ECS、up.sh、
  bot.liuyidi.me、liuyidi.me、demo-minibot, or to ship minibot / site /
  WebUI commits to Aliyun ECS. Not for mlf.liuyidi.me, minikb app
  publish, auth.liuyidi.me, or serverless-ship.liuyidi.me.
---

# Aliyun ECS Deploy（只 minibot + 落地页）

应用已经拆开，**先选仓**。本 skill 只覆盖第一行；其它域名立刻换仓读对应 skill。

| 域名 | 仓 | 云 | Skill |
|------|----|----|-------|
| `liuyidi.me` / `bot.liuyidi.me` | minibot | 阿里云 ECS | **本文件** |
| `kb.liuyidi.me` | minikb | 火山引擎 | minikb `deploying-volcengine-minikb` |
| `mlf.liuyidi.me` | mini-langfuse | 腾讯云 | mini-langfuse `deploying-tencent-mlf` |
| `auth.liuyidi.me` | mini-auth | 腾讯云 CVM | mini-auth `deploying-tencent-mini-auth` |
| `serverless-ship.liuyidi.me` | serverless-ship | Vercel | serverless-ship `deploying-vercel-serverless-ship` |

## 硬性发布规则（必须遵守）

**所有部署必须：commit → `git push`（到 `main`）→ 由 GitHub Actions workflow 发布。**

- **允许**：把改动 commit / push；用 `gh run list` / `gh run watch` 跟发布；验收公网 URL。
- **禁止**：本机 `ssh` / `rsync` / `scp` 直接改服务器；在 ECS 上手动 `git pull` + `docker compose` / `./up.sh` 当发布路径；绕过 workflow 的「热修」。
- **例外**：仅当用户**明确**要求排障（看日志、查挂载）且**不是**发布代码时，才可只读 SSH。排障后若需上线代码，仍走 push → workflow。

## Workflows（三者分开）

| 产物 | Workflow | 触发 path |
|------|----------|-----------|
| `liuyidi.me` site | `publish-site.yml`（`Publish Site (ECS)`） | `site/**` |
| `bot` WebUI SPA | `publish-webui.yml`（`Publish WebUI (ECS)`） | `webui/**` |
| `bot` Python server | `publish-server-ecs.yml`（`Publish Server (ECS)`） | `minibot/**`、`Dockerfile.minibot` |

共用 concurrency group `aliyun-ecs-demo-<ref>`，避免同机 `git reset` 互踩。

- **Site / WebUI**：GitHub Actions 构建 → scp → `promote-*.sh`（不重建 Docker 镜像）。
- **Server**：ECS 上 `docker compose build minibot`（瘦 Python 镜像；WebUI 经 `deploy/webui-dist` bind-mount）。

### Site（liuyidi.me）

```bash
git push -u origin HEAD
# path 未命中时：
gh workflow run "Publish Site (ECS)" --ref main
gh run watch
```

验收：`https://liuyidi.me/`、`/minibot/`、`/minibot/download/`

### WebUI（bot.liuyidi.me SPA）

```bash
gh workflow run "Publish WebUI (ECS)" --ref main
gh run watch
```

验收：`https://bot.liuyidi.me/`（无需重启容器，bind-mount 即时生效）

### Server（Python runtime）

```bash
gh workflow run "Publish Server (ECS)" --ref main
gh run watch
```

验收：

```bash
curl -fsS https://bot.liuyidi.me/health
curl -fsS -o /dev/null -w "bot %{http_code}\n" https://bot.liuyidi.me/
```

## Agent 发布步骤（通用）

```bash
git status -sb
git push -u origin HEAD
# 按改动选 workflow（见上表）；path 未自动触发时再 gh workflow run
gh run watch
```

## 约定

1. 不要在阿里云 compose 里起 mlf / minikb / auth。
2. 不要把 pem / 生产 `.env` 写入 commit。
3. 改了 minikb / mlf / auth / serverless-ship → 换仓读对应 skill。
4. **只改 site** → 只跑 Site；**只改 webui** → 只跑 WebUI；**只改 Python** → 只跑 Server。不要顺手触发无关全量重建。
