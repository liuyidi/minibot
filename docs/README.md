# minibot docs

> 单一文档根（2026-07-30 整理）。旧的 `docs/`（nanobot 产品手册）、`docs-plan/`、`minibot/docs/superpowers/` 已合并清理，勿再往回放。

## 从这里读

| 文档 | 用途 |
|------|------|
| [`getting-started.md`](./getting-started.md) | 本地启动 minibot + Dev UI / WebUI |
| [`status.md`](./status.md) | **现状快照**：已实现能力、配置位置、下一刀 |
| [`migration.md`](./migration.md) | **主路线图**（Phase / MSV / checklist） |
| [`client-api.md`](./client-api.md) | **统一客户端合同** + 渐进迁移 + OpenAPI；实现包 [`packages/minibot-client`](../packages/minibot-client) |
| [`human-in-the-loop.md`](./human-in-the-loop.md) | **HITL 审批**：策略、持久化、REST / WS 合同与 UI 渲染 |

## 架构补充

- [`roadmap/minibot-cursor-style-architecture.md`](./roadmap/minibot-cursor-style-architecture.md) | Cursor-style 架构对比、minibot v2 目标架构、durable execution / harness / worker pool、迁移路线

## 分册

| 目录 | 内容 |
|------|------|
| [`phases/`](./phases/) | 已完成 / 进行中 Phase 短记（验收与要点） |
| [`plans/`](./plans/) | 待执行切片计划（如 [API GET→POST](./plans/api-mutation-post-body.md)） |
| [`notes/`](./notes/) | 工程笔记（如 Dev UI Trace、[vs OpenClaw](./notes/minibot-vs-openclaw-gap.md)、[vs nanobot](./notes/minibot-vs-nanobot-gap.md)） |
| [`roadmap/`](./roadmap/) | 尚未并入主路线图的独立提案（如 A2A） |

## 客户端怎么接

```text
CLI / webui / desktop / React Native
        │
        ▼
  minibot Client API   ← 见 client-api.md
  (bootstrap + REST + WS)
        │
        ▼
  minibot FastAPI :8766
```

默认开发代理：`webui` 的 `MINIBOT_API_URL` → `http://127.0.0.1:8766`。

## 已删除（故意）

- 遗留 **nanobot** 用户手册（channels / chat-apps / 巨型 configuration 等）——与当前 minibot 主路径无关
- 重复的 superpowers plans/specs（已被 `migration.md` + `phases/` 吸收）
- Hermes / Nous 长篇对标稿（需要时可从 git 历史找回）
- 延期的 Dev UI → Next.js 长文（结论：优先级最低，未开工）
