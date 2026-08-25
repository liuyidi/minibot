---
title: 简介
description: minibot 是本地优先的 AI Agent 运行时：模型、工具、会话闭环，Web / Desktop / IM 同一套协议。
---

# minibot 简介

**minibot** 是一个本地优先的 **AI Agent 运行时**：用 FastAPI 承载「大模型 + 工具 + 会话」闭环，并用 React WebUI（及飞书 / 微信等 IM）与人对齐协作。

![minibot Desktop：侧栏里是对话、IM 频道、定时任务、技能和知识库；主区是对话输入、权限、项目和模型选择](/minibot/macos-client-preview.png)

## 一、核心能力

- **Agent 对话**：WebSocket 流式回复；多会话；中途 Stop；侧边栏「对话 / 频道」分流 WebUI 与 IM
- **多模型**：OpenAI 兼容 + Anthropic 等；平台内置模型与 BYOK preset；可选 preset 失败切换
- **工具执行**：读写改文件、网页搜索 / 抓取
- **Exec 沙箱**：Shell/exec 支持本地或 E2B 云沙箱
- **MCP**：接入 MCP（stdio / SSE / HTTP），工具注入 Agent Registry
- **记忆与压缩**：会话 JSONL、工作区 / Agent 记忆；长对话摘要与裁剪
- **技能与子代理**：内置与工作区 Skills；同步 spawn 子代理（异步后台即将补齐）
- **知识库**：可选对接 [minikb](https://kb.liuyidi.me/) 检索
- **定时任务**：Cron / 自动化，按时触发 agent 回合
- **IM 频道**：飞书、微信（iLink）扫码接入与配对
- **安全（HITL）**：高风险工具先暂停，等人批准 / 拒绝
- **可观测**：可选对接 [mini-langfuse](https://mlf.liuyidi.me/) 看 Trace / Session / 评分
- **多端入口**：[CLI](/minibot/cli/)、[Web](/minibot/web/)、[Desktop](/minibot/desktop/)、[App](/minibot/app/)，同一套 REST + WebSocket 协议

## 二、适用场景

- **浏览器**：打开 [bot.liuyidi.me](https://bot.liuyidi.me/)，登录后直接对话
- **命令行**：`npm i -g @liuyidi/minibot`，然后 `minibot login && minibot chat`（详见 [CLI](/minibot/cli/)）
- **本机桌面**：安装 Desktop，本机 gateway，会话留在这台电脑
- **IM**：飞书 / 微信里把任务交给同一个 runtime
- **自建**：本机或 Docker 跑 minibot，配置见 [GitHub README](https://github.com/liuyidi/minibot/blob/main/README.zh.md)

## 三、与传统 AI 对话的区别

| 传统 AI 对话 | minibot |
| --- | --- |
| 只能对话，提供建议 | 能调工具、改文件、跑命令，交付可验收的结果 |
| 需要人自己去点、去拷 | Agent 在工作区里读改文件、搜索网页、接 MCP |
| 单步问答 | 多轮 tool calling，可 Stop，可 HITL 审批高风险操作 |
| 记录留在某个网页会话里 | Web / Desktop / IM 同一套协议；Desktop 数据在本机 |

## 四、建议阅读顺序

1. [打开 Web](https://bot.liuyidi.me/) — 先走通一轮对话
2. [CLI](/minibot/cli/) — `npm i -g @liuyidi/minibot`，终端里登录与对话
3. [Web](/minibot/web/) · [Desktop](/minibot/desktop/) · [App](/minibot/app/) — 按入口了解能力
4. [下载 Desktop / App](/minibot/download/) — 需要本机或手机端时
5. [更新日志](/minibot/changelog/) — 当前版本用户能感知的变更
6. 要自建再看 [GitHub README](https://github.com/liuyidi/minibot/blob/main/README.zh.md)
