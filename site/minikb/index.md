---
title: 简介
description: minikb 是面向 Agent 的知识库：文档摄入、切片、向量检索、RAG QA，经 REST 供 minibot 等调用。
---

# minikb 简介

**minikb** 是面向 Agent / 应用的通用知识库后台：文档摄入、切片、向量化、检索和问答放在一个独立服务里，通过 REST 与 [minibot](https://bot.liuyidi.me/) 等消费方集成。

公网：[kb.liuyidi.me](https://kb.liuyidi.me/)（火山引擎；阿里云 nginx 只做 TLS 入口）。

## 一、核心能力

- **知识库 CRUD**：创建 / 列表 / 更新 / 删除 KB，看统计
- **文档摄入**：上传文档，切片后写入向量；任务进度可 SSE 订阅
- **检索**：vector 检索（keyword / hybrid / rerank 在后续阶段）
- **对象与队列**：Postgres + pgvector、MinIO、Redis 单体起步
- **鉴权**：API Key / JWT，给 Agent 调 REST
- **入口**：Dev UI（`/ui/`）、OpenAPI（`/docs`）、CLI（创建 KB / ingest / search）

## 二、适用场景

- **给 Agent 用**：minibot 需要查自己的文档，而不是把全文贴进对话
- **自己管一份库**：上传 PDF / 文档，检索片段，再接到问答
- **自建**：Docker Compose 拉起依赖，本地 `uvicorn` 或生产 GHCR 镜像

## 三、和「只能对话」的差别

| 把文件丢进聊天框 | minikb |
| --- | --- |
| 每次手工粘贴，上下文很快撑满 | 文档入库，按 query 取相关切片 |
| 和某个会话绑死 | 独立服务，多个 Agent / 应用可共用 |
| 没有摄入任务状态 | 摄入 job + SSE 进度 |
| 检索策略写在 prompt 里 | REST `retrieve`，后续可 hybrid / rerank |

## 四、建议阅读顺序

1. [打开知识库](https://kb.liuyidi.me/) — 公网入口（根路径会跳到 `/ui/`）
2. 本页简介
3. [更新日志](/minikb/changelog/)
4. 自建看 [GitHub README](https://github.com/liuyidi/minikb/blob/main/README.md)

当前产品阶段是 **KB-P0 Skeleton**（CRUD + 上传 + 向量检索）。P1 摄入完备、P2 检索完备、P3 QA Playground 尚未做完。
