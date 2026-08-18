# liuyidi.me 首页改为 minibot 产品页

日期：2026-08-18  
状态：已实现  
关联：Direction 02 门户已上线；本轮补信息层次，不改视觉语言。

## 问题

当前 [https://liuyidi.me](https://liuyidi.me) 是系列目录。对照 [有赞龙虾](https://claw.youzan.com/) 学的是**信息层次**（一句话主张 → 能力支柱 → 产品图 → CTA），不是装饰。缺口：

1. 多端（Web / CLI / Desktop / App）
2. 多渠道（飞书 / 微信）
3. Agent 类 OpenClaw 的「能干活」runtime

这些已写在 [`site/minibot/index.md`](../../site/minibot/index.md)，首页没有。

## 目标

首页变成 **minibot 产品页**；系列入口下沉到截图之后。视觉仍是 Direction 02。

## 非目标

- 不做成龙虾那种营销插画站。
- 不宣称未交付渠道（Telegram / Discord 等）。
- App 不提供安装 CTA（独立 RN 仓，公网无安装包）。
- 不改 `/minibot/` 正文结构（首页 CTA 可链过去）。

## 页面结构

1. **顶栏**：保持 简介 / Agent / 可观测 / 知识库 / 认证 / 小工具 / GitHub。
2. **Hero**
   - 标题：本地优先的 AI Agent 运行时
   - lede：Web / Desktop / CLI / App 同一套协议；飞书、微信把任务交给同一个 runtime；能调工具、改文件、跑命令。
   - 主 CTA：打开 Agent → `https://bot.liuyidi.me/`
   - 次 CTA：下载 Desktop → `https://bot.liuyidi.me/#/download/`
   - 去掉 hero 上的 DevUI `/ui`（可放到页脚小字或简介页）。
3. **三块能力**（浅灰 surface + 细边，标签用短词）
   - 多端：Web · Desktop · CLI · App（同一套 REST + WebSocket）
   - 多渠道：飞书 · 微信 iLink（扫码接入与配对）
   - Agent：工具循环 · 文件 · exec / MCP / Skills · HITL · Cron  
     一句：不像聊天框，更接近 OpenClaw 这类能交付结果的 runtime。
4. **截图**：复用 `/minibot/macos-client-preview.png`；旁白「本机 gateway，会话留在这台电脑」。
5. **系列入口**：保留现有五卡（minibot / mlf / kb / auth / ship）。
6. 走查顺序 + 「我能讲清楚的能力」折叠：**删除**（能力已在第 3 段展开）。

中英 i18n 保留（`landing.locale`）。

## 视觉

- 白底近黑、黑主按钮、`--mini-radius-*`。
- 能力块无彩色图标、无 emoji、无渐变。
- 截图 1px `border-soft`，无厚阴影。

## 验收

- [x] 首屏能读出 minibot 是什么，以及多端 / 多渠道 / Agent 三点。
- [x] 主次 CTA 为 Web 与 Desktop 下载；无 App 安装按钮。
- [x] 系列五入口仍在，靠后。
- [x] Direction 02 规则仍成立。
- [x] `cd site && npm run docs:build && npm run docs:check` 通过。
