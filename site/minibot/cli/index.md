---
title: CLI
description: npm 安装 @liuyidi/minibot，登录后连接云端 Gateway 对话。
---

# CLI

像 Codex / Claude Code 一样：装好即可用。默认连接云端 Gateway（`bot.liuyidi.me`）与认证（`auth.liuyidi.me`），与 [Web](/minibot/web/) / [Desktop](/minibot/desktop/) 共用同一套身份与会话。

## 安装

需要 [Node.js](https://nodejs.org/) ≥ 18。

```bash
npm i -g @liuyidi/minibot
```

## 开始使用

```bash
minibot login          # 浏览器 / 设备码登录
minibot chat           # 交互对话
minibot chat -m "你好"  # 单次提问
```

也可一步：

```bash
minibot login && minibot chat
```

[下载页](/minibot/download/) 提供可复制的安装与启动命令。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `minibot login` | mini-auth 设备授权，会话写入 `~/.minibot` |
| `minibot whoami` | 查看当前账号 |
| `minibot logout` | 退出登录 |
| `minibot status` | 认证状态 + Gateway 健康检查 |
| `minibot sessions list` | 列出会话 |
| `minibot sessions show <id>` | 查看会话线程 |
| `minibot sessions delete <id>` | 删除会话 |
| `minibot chat` | 交互 REPL（流式输出） |
| `minibot chat -m "..."` | 单次回合后退出 |

```bash
minibot status
minibot sessions list
minibot chat -m "帮我总结今天的待办"
```

## 默认连接

| 服务 | 地址 |
| --- | --- |
| 认证（login） | `https://auth.liuyidi.me` |
| Gateway（chat / sessions / status） | `https://bot.liuyidi.me` |

适合服务器、远程开发机、无界面环境与 SSH 会话；同一套命令在本机终端同样可用。

## 环境变量（可选）

| 变量 | 含义 |
| --- | --- |
| `MINIBOT_AUTH_URL` | mini-auth 基址（默认 `https://auth.liuyidi.me`） |
| `MINIBOT_API_URL` | Gateway 基址（默认 `https://bot.liuyidi.me`） |
| `MINIBOT_AUTH_SECRET` | 可选 `X-Minibot-Auth` 旁路（本地 / CI） |
| `MINIBOT_CONFIG_DIR` | 配置目录（默认 `~/.minibot`） |

也可对单次命令使用 `--base-url` / `--auth-url` / `--secret`（见 `minibot <command> --help`）。

## 自建 Gateway（进阶）

对外默认路径是 **npm CLI → 云端 Gateway**。若要在本机跑 Python runtime，再让 CLI 连本地：

```bash
# 终端 1：起本地 Gateway
cd minibot
uv sync --all-extras
uv run minibot         # → http://127.0.0.1:8766

# 终端 2：CLI 指向本地
MINIBOT_API_URL=http://127.0.0.1:8766 minibot status
# 或：minibot status --base-url http://127.0.0.1:8766
```

自建与完整配置见 [GitHub README](https://github.com/liuyidi/minibot/blob/main/README.zh.md)。

相关：[简介](/minibot/) · [下载](/minibot/download/) · [Web](/minibot/web/) · [Desktop](/minibot/desktop/) · [App](/minibot/app/)
