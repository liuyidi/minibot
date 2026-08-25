---
title: 简介
description: mini-langfuse 是自研的 LLM 可观测：Traces、Sessions、Scores、Prompts、Playground，Python SDK 可从 minibot 每轮上报。
---

# mini-langfuse 简介

**mini-langfuse** 是从零实现的精简 [Langfuse](https://langfuse.com)：弄清 ingestion、trace 树、评分和 Prompt 版本是怎么串起来的。后端 FastAPI，前端 React，Python SDK 用 httpx。

公网：[mlf.liuyidi.me](https://mlf.liuyidi.me/)（腾讯云）。[minibot](/minibot/) 每轮对话可上报到这里。

![mini-langfuse：agent-turn 链路追踪，observation 树、瀑布图与 Input / Output](/mini-langfuse/ui-preview.png)

## 一、核心能力

- **Traces / Observations**：摄入 API、树状查看、瀑布图（Tree | Waterfall | Detail 联动）
- **成本**：内置 OpenAI / Anthropic / Gemini 价表，Generation 上拆 token 与费用
- **Sessions**：按会话聚合对话时间线
- **Scores**：数值 / 布尔 / 分类，API + 界面打分
- **Prompts**：不可变 version + 可变 `production` 标签；SDK `get_prompt` / `compile`；界面 diff
- **Playground**：改消息、跑 mock 或真实模型、存成新版本；每次 run 也会变成 trace
- **SDK**：`trace()`、`@observe`、OpenAI drop-in、后台 flusher
- **可选队列面**：Redis Stream → worker → ClickHouse；Postgres 仍放控制面

## 二、适用场景

- **看 Agent 一轮到底调了啥**：minibot 上报后，在 mlf 里展开 span / generation
- **改 Prompt 并对照版本**：production 指针从 v1 推到 v2
- **本地弄清 Langfuse 模型**：SQLite 就能跑通；生产用 Postgres + 腾讯云 compose

## 三、和「只能看 API 日志」的差别

| 应用日志 / 裸 SSE | mini-langfuse |
| --- | --- |
| 一行一行文本 | trace 树 + 瀑布图，父子 span 对齐 |
| 费用要自己算 | 按模型价表算 token / cost |
| Prompt 散落在代码里 | 版本化 Prompt，SDK 按 label 取 |
| 无法给模型输出打分 | Score API 与界面评分 |
| 和业务库耦在一起 | 独立可观测服务，多项目密钥 |

## 四、建议阅读顺序

1. [打开可观测](https://mlf.liuyidi.me/)
2. 本页简介
3. [更新日志](/mini-langfuse/changelog/)
4. 自建看 [GitHub README](https://github.com/liuyidi/mini-langfuse/blob/main/README.md) 与 [腾讯云部署](https://github.com/liuyidi/mini-langfuse/blob/main/deploy/README.md)
