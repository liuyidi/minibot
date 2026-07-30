# Phase 4 — Cron + Automations（MVP）

**状态：** ✅ 完成（2026-07-26）  
**上游：** [`minibot-fastapi-migration.md`](../migration.md) Phase 4

## 目标

定时任务持久化 + asyncio 调度 + 经 Bus → Loop 执行；`/ui/automations.html` 可见。

## MVP 范围

- Schedule：`at` / `every` / `cron`（`croniter`）
- 落盘：`~/.minibot/cron/jobs.json`
- 触发：`bus.publish_inbound`（`channel=cron`）→ BusWorker → `handle_turn(entry=cron)`（waiter 回写 status）
- REST：list / create / delete / enable / disable / run
- UI：automations.html（正常 + 异常）
- **不做：** channel 投递、Dream system jobs、APScheduler、完整 nanobot 字段对齐
- **后置：** agent `cron` tool

## 验证

```bash
cd minibot && .venv/bin/pytest tests/test_cron_phase4.py -q
```

手动：打开 `/ui/automations.html` → Create every → Run now → Chat session 多一轮；坏 cron / 缺 session 看 Insight cases。
