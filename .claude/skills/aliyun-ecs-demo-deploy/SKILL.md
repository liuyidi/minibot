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

Workflows：

| 产物 | Workflow |
|------|----------|
| `liuyidi.me`（VitePress site） | `.github/workflows/publish-site.yml`（`Publish Site (ECS)`） |
| `bot.liuyidi.me`（runtime + WebUI） | `.github/workflows/publish-web-server-ecs.yml`（`Publish Web & Server (ECS)`） |

两者共用 concurrency group `aliyun-ecs-demo-<ref>`，避免同机 `git reset` / 构建互相踩。

### Site（liuyidi.me）

触发：

1. `git push origin main`（命中 `site/**`、`deploy/build-site.sh`、或该 workflow 自身）
2. 或：`gh workflow run "Publish Site (ECS)" --ref main`

```bash
git push -u origin HEAD
# 若 path 未命中：
gh workflow run "Publish Site (ECS)" --ref main
gh run list --workflow "Publish Site (ECS)" --limit 3
gh run watch
```

验收：

```bash
curl -fsS -o /dev/null -w "landing %{http_code}\n" https://liuyidi.me/
curl -fsS -o /dev/null -w "minibot %{http_code}\n" https://liuyidi.me/minibot/
curl -fsS -o /dev/null -w "download %{http_code}\n" https://liuyidi.me/minibot/download/
```

### Bot（bot.liuyidi.me）

触发：

1. `git push origin main`（命中 `minibot/**`、`webui/**`、`Dockerfile.minibot`、该 workflow 自身）
2. 或：`gh workflow run "Publish Web & Server (ECS)" --ref main`

```bash
git push -u origin HEAD
gh workflow run "Publish Web & Server (ECS)" --ref main   # 仅当 path 未命中时
gh run list --workflow "Publish Web & Server (ECS)" --limit 3
gh run watch
```

验收：

```bash
curl -fsS https://bot.liuyidi.me/health
curl -fsS -o /dev/null -w "bot %{http_code}\n" https://bot.liuyidi.me/
```

## Agent 发布步骤（通用）

```bash
# 1) 确认改动已 commit 且已 push 到 main
git status -sb
git push -u origin HEAD

# 2) 按改动选 workflow（见上表）；path 未自动触发时再 gh workflow run
# 3) gh run watch
```

## 约定

1. 不要在阿里云 compose 里起 mlf / minikb / auth。
2. 不要把 pem / 生产 `.env` 写入 commit。
3. 改了 minikb / mlf / auth / serverless-ship → 换仓读对应 skill，不要在本仓 workflow 里混发。
4. **只改 site** 时只跑 `Publish Site (ECS)`，不要顺手触发 bot 全量镜像重建。
