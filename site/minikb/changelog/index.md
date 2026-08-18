---
title: 更新日志
description: minikb 面向用户的重要变更。
outline: deep
---

# 更新日志

记录 **minikb** 面向用户的重要变更。仓库里还没有独立 `CHANGELOG.md`，这里按公网可感知的节点整理；细节仍以 [GitHub](https://github.com/liuyidi/minikb) 为准。

- [打开知识库](https://kb.liuyidi.me/)
- [GitHub](https://github.com/liuyidi/minikb)

## [Unreleased]

- 摄入多 parser / worker、keyword + hybrid + rerank、QA Playground（README 中的 KB-P1～P3）。

## 2026-08

### 变更

- 生产从「阿里云本机跑 minikb」改为 **火山引擎**；备案后 `kb.liuyidi.me` 直连火山 TLS，不再经阿里云 nginx 反代。
- 发布工作流改为 `publish-volcengine-minikb`，镜像走 GHCR。

### 新增

- KB-P0：知识库 CRUD、文档上传、向量检索、Dev UI / REST / CLI。
- 生产 Compose、回滚与运维清单；ECS/火山引擎自动发布。
