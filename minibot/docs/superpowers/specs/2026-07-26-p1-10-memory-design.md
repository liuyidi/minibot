# P1-10 · Memory 多文件 + 类型化 (Design)

> 对齐 `chengxiaobang/apps/backend/src/tools/memory-tools.ts` + `docs/memory.md`  
> 官方参考：Anthropic memory_20250818

## 1. 目标

- 从当前"workspace/memory/MEMORY.md 单文件"升级为独立 `~/.minibot/memory/`（跨 workspace 共享）
- 多文件 + 类型化 frontmatter + 交叉引用 `[[name]]`
- 六命令工具对齐官方：`view / create / str_replace / insert / delete / rename`
- 目录快照注入 system prompt，避免每 run 都调 view
- 不进审批队列（headless 也能记忆）

## 2. 目录布局

```
~/.minibot/memory/
  MEMORY.md              # 索引（无 frontmatter；每行 `- [title](file.md) — hook`）
  user_role.md
  feedback_testing.md
  project_northwind.md
  reference_docs.md
  ...
```

## 3. 单条 memory 结构

```md
---
name: user_role          # 与文件名一致
description: 一句相关性描述
type: user               # user | feedback | project | reference
---

正文...

[[project_northwind]] 提到的 acquisition 需要跨引用...
```

## 4. 工具契约

```
memory(command, **args)
  view(path?: str, limit?=100)              # path 省略 → 返回 MEMORY.md + top-level 列表
  create(path, content)                     # 已存在 → error
  str_replace(path, old, new)               # old 必须唯一
  insert(path, at_line, content)
  delete(path)
  rename(path, new_path)
```

- 路径穿越硬拦：只允许 `[a-zA-Z0-9_./-]+`，绝不出 `~/.minibot/memory/`
- 单文件大小上限 32 KiB；超出报错

## 5. System prompt 注入

`agent/context.py` 装配阶段：

```
【长期记忆】
根目录: ~/.minibot/memory/
索引 (MEMORY.md):
  - [User role](user_role.md) — in-house counsel...
  - [Feedback: no hedging](feedback_hedging.md) — CFO wants a number
文件列表 (path + bytes)：
  user_role.md (312B)
  feedback_hedging.md (487B)
  ...
读写规则：如需内容用 memory(command='view', path=...)；写入用 str_replace / insert / create。
```

- 快照总字符数不超过 4 KiB，超出后只列 top 30 大文件

## 6. 交叉引用解析

- `[[name]]` 在 view 结果里替换为超链接文本（`{name} → {path}`），便于模型点跳
- 允许模型手写；不校验目标是否存在（防止阻塞写入）

## 7. 与 chengxiaobang 敏感信息约束对齐

工具描述强制：Protected attributes / SSN / 金融账户等**除非用户明确要求**不允许写入。命中关键词的写请求**警告**（不硬拦，模型自决）。

## 8. 备份与迁移

- 每次 write 前把原文件 mv 到 `.trash/YYYYmmdd/<file>.<ts>.md`（默认保留 30 天）
- 迁移：启动时若发现旧 `workspace/memory/MEMORY.md` 且新目录不存在 → 拷贝一份到新目录，提示用户

## 9. 审计

- 每次 write 事件 `memory.written{ path, op, bytes }` 走全局 SSE
- `GET /api/memory/tree` 供 UI 展示

## 10. 错误路径

- create 已存在 → `AlreadyExists`
- str_replace old 多次匹配 → `NotUnique`
- 路径穿越 → `InvalidPath`
- 单文件超限 → `TooLarge`
