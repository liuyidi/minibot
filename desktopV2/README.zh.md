# minibot Desktop V2（本机 gateway）

[English](./README.md) | 简体中文

> 实验目录：从 `desktop/` 复制而来，在 [`feature/desktopv2`](../../) 上演进。  
> 设计：[`docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md`](../docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md)  
> 计划：[`docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md`](../docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md)

与 `desktop/`（远程薄壳）并存；**默认连本机 `http://127.0.0.1:8766`**，并由壳尝试拉起本地 minibot。

## 开发

```bash
# 终端 A：本机 gateway（若壳未能自动拉起）
cd minibot && uv run minibot

# 终端 B
cd desktopV2
npm install
npm run dev
```

自动拉起顺序：

1. `MINIBOT_SIDECAR`（冻结二进制或可执行路径）
2. PATH 上的 `minibot`

数据目录：Tauri app data 下的 `engine/`（`MINIBOT_SERVER_DATA_DIR`）。

## 登录（mini-auth + `minibot://`）

1. WebUI 检测到 `minibotHost.openLogin` → 系统浏览器打开  
   `http://127.0.0.1:8766/auth/login?desktop=1&next=…`
2. mini-auth 完成后跳转 `minibot://auth/callback?code=&state=`
3. 壳收 deep link → `POST /auth/desktop/complete` → 导航  
   `/auth/desktop/session?token=…` 写入 cookie

需：mini-auth 客户端白名单含 `minibot://auth/callback`；macOS 需安装过一次 `.app` 后协议才稳定（`tauri dev` 有限）。

## 与 V1 差异（目标）

| | desktop (V1) | desktopV2 |
|---|---|---|
| 默认 | `bot.liuyidi.me` | `127.0.0.1:8766` |
| 进程 | 不拉起 | 拉起 sidecar / `minibot` |
| 登录 | Web 同源 | 系统浏览器 + `minibot://`（待做） |
| bundle id | `me.liuyidi.minibot.desktop` | `me.liuyidi.minibot.desktopv2` |

## 打包

仍用 Tauri；sidecar 冻结与 CI 见设计文档 Task 4。当前以 PATH/`MINIBOT_SIDECAR` 开发为主。
