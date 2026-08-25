---
title: CLI
description: 用 npm 安装 minibot 命令行，登录后连接云端 Gateway。
---

# CLI

远程命令行客户端：安装后登录即可对话，默认连接 `bot.liuyidi.me`（与 Web / Desktop 同一套身份与会话）。

```bash
npm i -g @liuyidi/minibot
minibot login
minibot chat
```

需要 Node.js ≥ 18。

常用能力：

- `minibot login` / `logout` / `whoami`：mini-auth 设备授权
- `minibot status` / `sessions` / `chat`：经 Client API 访问 Gateway
- 适合服务器、远程开发机、无界面环境与 SSH 会话

### 自建 Gateway（进阶）

若要在本机跑 Python runtime，再让 CLI 连本地：

```bash
cd minibot
uv sync --all-extras
uv run minibot         # → http://127.0.0.1:8766

MINIBOT_API_URL=http://127.0.0.1:8766 minibot status
```

自建与配置详见 [GitHub README](https://github.com/liuyidi/minibot/blob/main/README.zh.md)。

相关：[简介](/minibot/) · [下载](/minibot/download/) · [Web](/minibot/web/) · [Desktop](/minibot/desktop/) · [App](/minibot/app/)
