# minibot Dev UI → Next.js 迁移计划

> **落盘路径：** [`docs-plan/devui-nextjs-migration.md`](./devui-nextjs-migration.md)  
> **主路线图交叉引用：** [`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md)（延期轨道 · 优先级最低）  
> **日期：** 2026-07-24

## 背景与范围

**现状：** [`minibot/src/minibot/static/devui/`](../minibot/src/minibot/static/devui/) 共 6 文件、约 2790 行；[`main.py`](../minibot/src/minibot/main.py) 用 `StaticFiles(..., html=True)` 挂到 `/ui`。无 bundler、无共享 CSS（每页内联 token）、Chat（`index.html` ~1095 行）即将吃 Phase 1 工具卡片 / Phase 2 流式，维护成本会陡增。

**范围锁定：** 仅 **Dev UI / 实验室页**（Chat、Trace、runtime、session-files、race、以及后续 tools/context/…）。**不**把产品向 [`nanobot/webui`](../webui/)（Vite SPA）并进本计划——两者合同不同：Dev UI = Insight 实验室；webui = 产品对齐。

**优先级：** **最低**——主路线图 Phase 1–14 / MSV 切换完成后再开正式迁移（阶段 B–D）；此前只做「静态减负」预备（阶段 A），避免双前端并行。若仓库已提前脚手架 Next，以本文件阶段勾选为准。

## 目标架构

```text
Browser ──► Next 静态页 (/ui/*) ──mount──► FastAPI StaticFiles
                │
                └── same-origin fetch/WS ──► /api /auth /ws /api/dev
```

| 项 | 选择 |
|----|------|
| 框架 | Next.js App Router（TypeScript） |
| 渲染 | `output: 'export'` 静态导出（无 Node SSR 运行时） |
| 托管 | 构建产物挂到 FastAPI `/ui`（替换今日 `static/devui` 源码页） |
| 开发 | `next dev` + rewrite `/api` `/auth` `/ws` → `http://127.0.0.1:8766` |
| 包布局 | `minibot/devui/`（Next 工程）；Python 包 `force-include` 构建产物目录 |
| API 边界 | REST/WS/`/api/dev/*` **全部留在 FastAPI**；Next 只做页面与客户端状态 |
| basePath | `/ui`（与 FastAPI mount 对齐） |

## 阶段划分

### 阶段 A — 静态减负（主线 Phase 1–2 期间可穿插，仍可用纯 HTML）

目的：延缓崩溃，并为日后迁移划清模块边界。

1. 抽出共享 `common.css`（CSS variables / header / badge），各 HTML 引用。
2. 鉴权 + `fetch` 升到 `common.js`：`bootstrap`、`api(path, opts)`。
3. Chat：工具卡片 / 流式相关逻辑用 IIFE 分文件，禁止 `index.html` 涨到 2k+ 行。
4. 导航单一事实源：只维护 `common.js` 的 `DEV_NAV`。
5. Trace：保留 localStorage + BroadcastChannel；新能力优先经 REST/WS。

**验收：** pytest `/ui/*` 200 仍绿；视觉无明显回归。

### 阶段 B — 脚手架（正式迁移 Kickoff）

1. `minibot/devui/` 初始化 Next（App Router、TS、`output: 'export'`、`basePath: '/ui'`）。
2. 建立 `lib/api.ts`、`lib/ws.ts`、`lib/theme.ts`、`components/DevNav.tsx`、`AppShell.tsx`。
3. 开发：`pnpm dev`（Next）+ `minibot` gateway 双进程。
4. `pnpm build` → 产物进 Python 静态目录；更新 hatch `force-include`。

### 阶段 C — 按页迁移（薄页先、Chat 后）

1. shell 页：`/runtime`、`/session-files`、`/race`
2. `/tools`（若有）
3. `/trace`（优先 WS/REST；localStorage 降为兼容层后删除）
4. `/` Chat（单独里程碑）
5. 其后实验室页直接用 Next 新建，不再写 HTML

### 阶段 D — 切流与清理

1. `main.py` 的 `_DEVUI_DIR` 指向 Next 导出目录；`GET /` 仍 redirect `/ui/`。
2. 删除旧手写 HTML 源（或仅保留 README 指向 `devui/`）。
3. 修订主计划 Dev UI「轻量 / 不引框架」条款 → 指向本计划终态。
4. README：开发用 Next；发行用构建进 wheel 的静态资源。

## 与主路线图的关系

| 时间 | Dev UI 策略 |
|------|-------------|
| Phase 1–14 主线 | 继续可用静态；优先阶段 A；能力（工具卡片等）先在静态/已迁页交付 |
| MSV 切换 / Phase 9+ 之后 | 启动阶段 B–D（若未提前完成） |
| Composer UX | 不阻塞能力；迁 Next 时整体搬运组件 |

## 明确不做

- 不为 Dev UI 上 SSR / 服务端 Session。
- 不合并改造产品 `webui` Vite SPA。
- 不把业务逻辑搬进 Next Route Handlers。
- 不在主线能力未稳时强制双前端并行（阶段 A 除外）。

## 成功标准

- 同端口：`http://127.0.0.1:8766/ui/` 仍为入口；API/WS 合同不变。
- 页面可按 App Router 拆分；Chat 不再是单文件千行 HTML。
- `pnpm build` + FastAPI mount 后 Insight DoD 仍可演示。
- 文档单一事实源指向 `minibot/devui/`。

## Checklist

- [ ] **阶段 A** 静态减负（common.css / api / Chat 分文件）
- [ ] **阶段 B** Next 脚手架 + static export + 挂载产物
- [ ] **阶段 C** 按页迁移
- [ ] **阶段 D** 切流与清理
