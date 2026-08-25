---
title: CLI
description: minibot 命令行：本机起 gateway，或远程连已有服务。
---

# CLI

命令行客户端：本机起 gateway，或远程连已有服务。

```bash
cd minibot
uv sync --all-extras   # 或 pip install -e ".[feishu,weixin]"
uv run minibot         # 本机 gateway → http://127.0.0.1:8766
```

常用能力：

- `minibot`：启动本地 runtime / 健康检查与 WebUI
- 远程客户端：`status` / `sessions` / `chat`（统一 Client API；可配合 mini-auth Bearer）
- 适合脚本化、服务器自建、与 IM / Desktop 并存的终端工作流

自建与配置详见 [GitHub README](https://github.com/liuyidi/minibot/blob/main/README.zh.md)。

<div class="shot-placeholder" role="img" aria-label="CLI 截图预留">
  <span>截图预留 · CLI</span>
</div>

相关：[简介](/minibot/) · [下载](/minibot/download/) · [Web](/minibot/web/) · [Desktop](/minibot/desktop/) · [App](/minibot/app/)
