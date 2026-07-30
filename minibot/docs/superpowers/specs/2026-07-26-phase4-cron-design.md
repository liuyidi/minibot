# minibot Phase 4 — Cron / Automations MVP

**日期：** 2026-07-26  
**状态：** 执行中  
**非目标：** IM 投递、Dream、APScheduler、cron tool（后置）

## 数据

`~/.minibot/cron/jobs.json`：

```json
{
  "version": 1,
  "jobs": [
    {
      "id": "…",
      "name": "ping",
      "enabled": true,
      "session_id": "<uuid>",
      "schedule": { "kind": "every", "every_ms": 30000 },
      "payload": { "message": "Say hello from cron" },
      "state": { "next_run_at_ms": 0, "last_status": null },
      "created_at_ms": 0,
      "updated_at_ms": 0,
      "delete_after_run": false
    }
  ]
}
```

## 运行时

`CronService`：lifespan start/stop；每秒 tick；到期 → `on_job` → bus inbound。  
`BusWorker`：`metadata.source=cron` 时 `entry="cron"`。

## API

| 方法 | 路径 |
|------|------|
| GET | `/api/webui/automations` |
| POST | `/api/webui/automations` |
| DELETE | `/api/webui/automations/{id}` |
| POST | `/api/webui/automations/{id}/enable` |
| POST | `/api/webui/automations/{id}/disable` |
| POST | `/api/webui/automations/{id}/run` |
| GET | `/api/dev/cron` |
