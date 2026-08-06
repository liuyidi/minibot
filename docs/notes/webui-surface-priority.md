# WebUI 表面优先：下一刀重排（2026-08-06）

> 原则：**侧栏露出的入口必须可用，或先关掉入口**；对话主路径（权限 / 附件）优先于 `/v1`、Phase 12 等。  
> 审计依据：产品 WebUI 仍大量沿用 nanobot 合同，而 minibot FastAPI 实现更简 → 「露出但半残」。

## 露出 vs 实际

| 入口 | `UI_ENTRY` | 现状 |
|------|------------|------|
| 技能 | `skills: true` | ✅ 列表 `available` + `GET /api/webui/skills/{name}` 详情；requires 驱动可用性；prompt 过滤 unavailable（启用开关 / 市场仍后置） |
| 定时任务 | `automations: true` | ✅ 列表/启停/跑/删/改已对齐 minibot POST；有 `origin`；**产品内无新建按钮**（API/Dev UI 可建） |
| 知识库 | `knowledge: true` | **外链** minikb 门户，非应用内页；聊天 `kb_*` 仅当配置了 `MINIKB_*` |
| 对话权限 | Settings Security 被 `SETTINGS_SECTIONS` 藏起 | HITL 仅 approve/reject；**无 allow once / always**；Default access UI 不生效 |
| 附件 📎 | Composer | **仅 png/jpeg/webp/gif**；后端已允许 pdf/md/csv/视频等，前端未开 |

## 推荐优先级（WebUI 体感）

### P0 — 露出即能用（或先藏）

1. **Automations 合同对齐** ✅（2026-08-06）  
   WebUI `api.ts` ↔ `automations.py`（POST enable/disable/run、DELETE、JSON update；`origin`；session list；删会话级联）。  
   *仍缺：* 产品 WebUI 内新建入口（可用 API / Dev UI 创建）。  
   *系统任务：* Heartbeat（默认 1h）+ Dream 薄巩固（默认关 / 2d）已注册为 protected cron。

2. **Skills 最小闭环** ✅（2026-08-06）  
   `GET /api/webui/skills/{name}` + `available` / `requirements` / `raw_markdown`；unavailable 不进 always/catalog。  
   *仍缺：* 启用开关、skills.sh 市场、`$skill` 显式激活。

3. **Knowledge 期望管理**  
   侧栏标明外链 / 健康探测；未配 minikb 时禁用或灰态文案。不做完整上传页（仍归 minikb）。

### P0 — 对话主路径

4. **默认权限生效**  
   Settings 露出 Security / Default access（扩 `SETTINGS_SECTIONS`）；接线 allow once / always / deny 策略（Phase 11 余量）；Runtime 可看/改 `exec_backend` 若 demo 需要。

5. **附件扩面（Composer）**  
   先开后端已支持的文本/文档：`pdf`、`md`、`txt`、`csv`、`json`（进上下文或落盘预览）；拒绝态文案清晰。视频可后置。

### P1 — Composer / API 债

6. API mutation GET→POST（[`api-mutation-post-body.md`](../plans/api-mutation-post-body.md)），含 sidebar-state。  
7. UX-04 复制、UX-05 重试、UX-02 队列。  
8. Phase 8 余量：`/model`、commands、workspaces CRUD。

### P2 — 后置

- Phase 9 正式切默认后端、Phase 12 long-goal、平台 Auto 失败链。  
- **Phase 7 `/v1`：最低。**  
- Voice / transcribe：保持隐藏。

## 验收口径（每项）

- 侧栏点进去：**能完成主任务**，或入口关闭 / 明确「即将推出」。  
- 异常路径：API 404/未配置 minikb / 附件拒收，UI 有可读错误，不静默空。  
- Dev UI 与产品 WebUI **同一合同**，禁止再分叉。
