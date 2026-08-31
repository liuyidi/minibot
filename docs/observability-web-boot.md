# Web boot observability（OpenTelemetry）

> 状态：Web 启动链路已切到 **OTel spans → Collector → Tempo → Grafana**  
> 范围：`webui/`（Desktop 后续复用同一 tracer 约定）  
> 自研 `POST /api/telemetry/boot` 已移除

## 目标

1. Web 打开到可聊天，慢在哪一段？
2. 是慢还是失败？卡在哪一 stage？
3. 用 `trace_id` / `boot.id` 在 Grafana Tempo 回放

与 [mini-langfuse](./phases/phase-10-langfuse.md) 并存：Langfuse 管 LLM；本方案管 **boot / 前端链路**。

## 「启动完成」定义（TTI）

**`first_interactive`**：`BootState.status === "ready"` 且 `AppLayout` 已 mount。  
失败：root span `web.boot` status=ERROR，attribute `boot.error_code`。

## Span 模型

| Span | 含义 |
|------|------|
| `web.boot` | 一次启动（root） |
| `web.boot.js_boot` | session 创建 |
| `web.boot.auth_config` | `GET /auth/config` |
| `web.boot.bootstrap` | `GET /webui/bootstrap` |
| `web.boot.client_ready` | `MinibotClient.connect` |
| `web.boot.first_paint` | ready UI 首次渲染 |
| `web.boot.first_interactive` | Layout mount / TTI |

关键 attributes：`boot.id`、`boot.platform=web`、`boot.channel`、`boot.cold_start`、`boot.duration_ms`、`boot.error_code`、`boot.total_ms`。

Console 仍打印 `[web-boot]` JSON（含 `boot_id` + `trace_id`），便于本地调试。

## 管道

```text
webui (OTel JS)
  → OTLP/HTTP :4318
  → otel-collector
       ├─ Tempo :3200          → Grafana Explore (瀑布图)
       ├─ ES `otel-traces`     → Kibana Discover + Grafana Explore (ES)
       └─ logs/otel-*.jsonl    → Filebeat → ES `logs-otel-*`
```

本机栈：`~/Gitea/infra-observability`（见该仓库 `docs/grafana-kibana.md`）。

| 环境变量 | 含义 |
|----------|------|
| `VITE_OTEL_EXPORTER_OTLP_ENDPOINT` | 覆盖 traces URL（默认 Vite=`/otlp/v1/traces`，其它=`http://127.0.0.1:4318/v1/traces`） |

## SLO（草稿）

| 指标 | 本机 /dev | stable |
|------|-----------|--------|
| `boot.total_ms` P95 | < 5000 | < 3000 |
| boot fail rate | < 5% | < 2% |

## 实现落点

| 路径 | 职责 |
|------|------|
| `webui/src/lib/telemetry/otel.ts` | Provider + OTLP exporter |
| `webui/src/lib/telemetry/boot.ts` | Stage → spans |
| `webui/src/hooks/auth/useGatewayBoot.ts` | Boot 流程打点 |
| `infra-observability/otel-collector/` | 接收 OTLP |
| `infra-observability/tempo/` | 存 traces |

## 验收

- [x] 一次加载有 `boot.id` + OTel `trace_id`
- [x] Console 可见 stage 时间线
- [x] 失败带 `error_code` / ERROR span
- [x] 单元测试（`enableOtel: false`）
- [ ] Grafana Tempo 能搜到 `service.name=minibot-webui` 的 `web.boot`

## 下一步

1. Grafana 看板：boot 总耗时 / 分 stage
2. Python sidecar 也打 OTel，与 Web 同 Collector
3. Desktop Tauri 增加 native/sidecar spans
