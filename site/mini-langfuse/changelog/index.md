---
title: 更新日志
description: mini-langfuse 面向用户的重要变更。
outline: deep
---

# 更新日志

记录 **mini-langfuse** 面向用户的重要变更。仓库里还没有独立 `CHANGELOG.md`，按 README 里程碑和公网部署整理；细节见 [GitHub](https://github.com/liuyidi/mini-langfuse)。

- [打开可观测](https://mlf.liuyidi.me/)
- [GitHub](https://github.com/liuyidi/mini-langfuse)

## [Unreleased]

- 评测跑批、更多 Evaluator 产品化（计划文档 M6+；未作为本页验收项）。

## 2026-08

### 变更

- 生产只在 **腾讯云** `mlf.liuyidi.me`；阿里云 demo 栈删除，历史 PG 已导入腾讯云。
- 本地 `docker-compose.yml` 只给开发；生产入口是 `deploy/`。

### 新增

- Redis Stream + ClickHouse 摄入 worker，以及设置页。
- Traces / Sessions 列表分页；界面中英切换（默认中文）。
- 人工反馈类 Score 文案澄清。

## 里程碑（产品面）

已在 README 勾完、用户能直接用到的能力：

| 节点 | 内容 |
| --- | --- |
| M1 | 摄入、trace 树、Python SDK、demo |
| M2 | 成本表、`@observe`、OpenAI wrapper |
| M3 | Session 聚合、后台 flusher |
| M4 | Score、版本化 Prompt、diff |
| M5 | Compose + pytest（幂等摄入、成本、树、label、SDK 隔离） |
| M7 | Trace 详情瀑布图，三栏联动 |
| M8 | Playground；每次 run 落成 `playground:*` trace |
