# minibot Client API — 统一合同大纲

> 状态：**大纲 v0.2**（2026-07-30）  
> 目标：CLI / Dev UI（`/ui/` Insight）/ WebUI / Desktop / React Native **全部经 Client API 合同** 访问 **唯一 Gateway = minibot**（默认 `:8766`）。  
> 实现真相源（代码）：`minibot/src/minibot/api/`、`webui/src/lib/{bootstrap,api,nanobot-client}.ts`  
> 迁移原则：**先并排、再切换、后删除**——不打断现有 Chat / Settings / Dev UI 业务路径。

本文回答：合同长什么样、各端异同、共享 SDK、**渐进式迁移**。**不是**完整 OpenAPI；细节以 `/docs` 与代码为准。

---

## 1. 原则

1. **一个 Gateway，多客户端** — 不按端拆第二套 API。
2. **所有交互面最终都走 Client API** — 含产品 WebUI、Dev UI / Insight、远程 CLI、Desktop、RN；禁止新代码直调 `AgentLoop`（进程内 CLI 仅作过渡兼容）。
3. **Agent 主路径 = bootstrap + REST + WS multiplex** — 纯 LLM 脚本可另走 `/v1`（Phase 7），不替代 agent 合同。
4. **能力可降级** — 未实现路由返回明确 404/501；客户端用 feature gate，禁止 silent HTML 回退。
5. **命名迁 minibot** — 路径兼容；代码/env 逐步去掉 `nanobot` 前缀（旧名 alias）。

---

## 2. 同 Gateway · 异调用面

```text
webui · Dev UI/Insight · CLI · Desktop · RN
              │
              ▼
     Client API 合同（@minibot/client 或同合同 Python 绑定）
              │
              ▼
     minibot Gateway :8766     ← 唯一 API gateway
              │
              ▼
         Agent runtime
```

**是的：都是同一个 API gateway。** 差异不在「接谁」，而在「调哪些路径 / Transport / 进程关系」。

| 端 | 同一 Gateway？ | 主要调用面 | 差异要点 |
|----|----------------|------------|----------|
| **webui** | ✅ | L0 + L1 产品 REST + **L2 WS 聊天** | 产品 UX；少碰 `/api/dev`；`UI_ENTRY` 藏未就绪能力 |
| **Dev UI / Insight** | ✅ | L0 + **大量 `/api/dev/*`** + 可选 L1/L2 | 同源静态 `/ui/`；fault 注入、bus pause、trace——调试面 |
| **CLI（目标：远程）** | ✅ | L0 + L1 + 可选 L2 | TTY；Python 用**同合同绑定**（不必强依赖 npm 包） |
| **CLI（现状：嵌入）** | ⚠️ 同进程 runtime | ❌ 直调 `AgentLoop` | **过渡兼容**；迁移期保留，默认改为 remote |
| **Desktop** | ✅ | 接近 webui | `WebSocket` 常注入 host bridge |
| **RN** | ✅ | 先 L0 + sessions + L2 | `baseUrl` = 局域网 IP；token 在 SecureStore |

### 相同点

- 主机、鉴权（bootstrap → Bearer / `?token=`）
- Session / Agent / 流式 / tools / fallback 语义
- 合同分层 L0–L2（L3 可选）

### 不同点

- **调用面**：产品路径 vs `/api/dev` Insight
- **Transport**：浏览器同源 / Vite proxy / host WS / 真机 IP
- **进程**：远程客户端 vs（过渡）进程内 Loop
- **实现语言**：TS 包 `@minibot/client`；CLI 可为 Python 镜像客户端（合同一份）

---

## 3. 现状（切换点）

| 客户端 | 今天打谁 | 今天是否经 Client API |
|--------|----------|------------------------|
| `webui/` | minibot `:8766`（`MINIBOT_API_URL`） | 半套：散落 `bootstrap`/`api`/`minibot-client`，未成包 |
| Dev UI `/ui/` | 同源 minibot | ❌ 各页手写 `fetch` |
| CLI | 进程内 `AgentLoop` | ❌ |
| Desktop | host → 同合同 | 半套（随 webui） |
| RN | 未接 minibot | ❌ |

**没有**运行时 nanobot/minibot 双后端开关；legacy `:8765` 仅显式 URL 过渡。

---

## 4. 合同分层

```text
┌─────────────────────────────────────────┐
│  L0  Auth / Bootstrap                   │
│  GET /webui/bootstrap  (or /auth/…)     │
├─────────────────────────────────────────┤
│  L1  REST（会话 / 设置 / 自动化 / dev）  │
│  Authorization: Bearer <token>          │
├─────────────────────────────────────────┤
│  L2  WebSocket multiplex `/ws?token=`   │
│  new_chat / attach / message / delta…   │
├─────────────────────────────────────────┤
│  L3  可选 OpenAI 兼容 `/v1/*`（Phase 7） │
└─────────────────────────────────────────┘
```

### 4.1 L0 — Bootstrap

| 项 | 约定 |
|----|------|
| 路径 | `GET /webui/bootstrap`（兼 `GET /auth/bootstrap`） |
| 可选头 | `X-Minibot-Auth` |
| 响应 | `token`, `ws_path`, `expires_in`, `model_name?`, `runtime_surface: "minibot"` |

### 4.2 L1 — REST

**产品面（对齐 webui `api.ts`）**：sessions、settings、workspaces、automations、skills…  

**Insight 面（`/api/dev/*`）**：runtime、fallback simulate/arm、mcp probe、trace 辅助、race… —— **同一 Gateway**，权限上可后续限制为本地/dev。

**缺口 / stub**：media、file-preview 等（Phase 8+）；客户端必须降级。

### 4.3 L2 — WebSocket

客户端 → `new_chat` / `attach` / `message` / `abort` / `set_workspace_scope` / `approval_response`…
服务端 → `delta` / `reasoning_*` / `stream_end` / `provider_switched` / `approval_required` / turn 帧…

参考：`webui/src/lib/nanobot-client.ts` → 迁入包后称 `MinibotClient`。

### 4.4 HITL 审批

高风险工具调用会暂停而非执行。WS 收到 `approval_required` 后展示本地组件，客户端用
`approval_response` 回传 `approve` 或 `reject`；断线恢复时可通过
`GET /api/approvals?session_id=&pending_only=true` 获取待办项。REST 同步 turns 的暂停响应也包含
`approval_id` 与 `approval`。完整状态机、字段和安全边界见
[`human-in-the-loop.md`](./human-in-the-loop.md)。

### 4.4 L3 — `/v1`（可选）

脚本/外部 SDK；**不**作为 Chat / Insight 主路径。

---

## 5. 共享 SDK

| 绑定 | 用途 |
|------|------|
| **`packages/minibot-client`（TS）** | webui、Dev UI（bundled 或 import map）、Desktop、RN |
| **Python 薄客户端（同合同）** | CLI remote；方法名/路径与 TS 对齐，可从 OpenAPI 生成 |

### 建议 TS 包表面

```text
createClient({ baseUrl, getSecret?, fetch?, WebSocket? })
  .bootstrap()
  .sessions.list() | .create() | .thread() | .delete()
  .settings.get() | .patch()
  .dev.runtime() | .dev.fallback.simulate() | …   # Insight
  .ws.connect() → { newChat, attach, send, abort, on(event) }
```

错误模型：`ApiError { status, code?, message }`；HTML 误响应 = gateway mismatch。

---

## 6. 渐进式迁移计划（不影响现有业务）

总策略：**Strangler（绞杀者）** —— 新包与旧模块并排；调用方一次改一处；旧路径保留到流量切完再删。

```text
M0 文档冻结
M1 包骨架 + 单测（无调用方）
M2 webui 薄封装转发（行为不变）
M3 webui 主路径切包（Chat WS + sessions）
M4 Dev UI 一页一切换
M5 CLI remote 并行（默认仍 embed）
M6 CLI 默认改 remote；embed 变 --embed
M7 RN / Desktop / 命名清理
M8 删除旧散落实现
```

### M0 — 文档与合同冻结（本文）

- [x] 大纲：同 Gateway、异调用面、全端经 Client API  
- [ ] 附录：从 `api.ts` 导出 L1 路径表（可手工一页）  
- **风险：** 无 · **回滚：** 无代码

### M1 — `packages/minibot-client` 骨架（零业务切换） ✅

- 包路径：`packages/minibot-client`（发布名 `@liuyidi/minibot-client`；业务 import 用 alias `@minibot/client`）
- 已实现：`bootstrap`、`http`/`ApiError`、`sessions` 子集、`ws` 核心（connect/send/delta/abort）
- 单测：包内 vitest 绿；**尚未**改 webui import
- RN：`file:../minibot/packages/minibot-client`（见 `minibot-react-native`）
- **风险：** 无 webui 运行时 · **验收：** `cd packages/minibot-client && npm test` · **回滚：** 删包目录

### M2 — webui 兼容层（仍无用户可感变化）

```text
webui/src/lib/api.ts          → 内部改为调用 @minibot/client（或 re-export）
webui/src/lib/bootstrap.ts    → re-export
webui/src/lib/nanobot-client.ts → export { MinibotClient as NanobotClient } from "@minibot/client"
```

- 组件 **继续** `from "@/lib/api"` —— 零改动面  
- **验收：** `cd webui && bun test`；手动 Chat 一轮  
- **回滚：** 恢复三文件为内联实现（git revert）

### M3 — webui 主路径显式切包（可选拆 PR）

- Chat / sessions hooks 改为 `from "@minibot/client"`  
- Settings 其余 REST 可第二 PR  
- **验收：** 同 M2 + Settings 改 model preset  
- **回滚：** hooks 改回 `@/lib/*`（兼容层仍在）

### M4 — Dev UI / Insight 逐页切换

顺序建议（由简到繁）：

1. `runtime.html`（含 fallback 调试）  
2. `providers.html` / `mcp.html`  
3. `index.html` Chat（若仍手写 WS）  
4. 其余 Trace / tools / …

做法：

- 短期：`/ui/vendor/minibot-client.js`（IIFE/ESM bundle）+ 各页 `createClient({ baseUrl: "" })`  
- 或后续 Dev UI 若上 bundler，再 npm 依赖  

规则：**一页一 PR**；旧 `fetch` 删干净才合  

- **验收：** 该页 Insight DoD（正常 + 异常）  
- **回滚：** 单页还原手写 fetch  

### M5 — CLI remote **并行**（默认行为不变）

- 新增：`minibot chat --remote [--base-url http://127.0.0.1:8766]` → Python 客户端走 bootstrap + turns 或 WS  
- **默认**仍：`cli_chat` 进程内 Loop（现有脚本/CI 不炸）  
- **验收：** 起 gateway 后 `--remote` 能聊；不传 flag 行为与今天一致  
- **回滚：** 去掉 subcommand / flag  

### M6 — CLI 默认切 remote

- 默认走 Client API；`--embed` 保留给单测/无 server 场景  
- 文档 / README 更新「先 `minibot` 再 chat」或「chat 自动 spawn server」  
- **验收：** 新用户路径；旧 CI 加 `--embed`  
- **回滚：** 默认改回 embed  

### M7 — RN / Desktop / 命名

- RN Phase 1：依赖同一 TS 包（或发布 workspace）  
- Desktop：只换 `WebSocket` 注入  
- env：`MINIBOT_API_URL`  
- **验收：** RN 连上本机 8766 流式一轮  

### M8 — 删除旧实现

- 删除 webui 内联重复、Dev UI 残留裸 fetch、（可选）永久移除 `--embed`  
- **前提：** M3–M6 稳定 ≥1 个迭代 · **回滚：** git  

---

### 迁移期护栏（保证业务不中断）

| 护栏 | 做法 |
|------|------|
| **双轨** | 旧模块与包并存，直到调用方切完 |
| **兼容 re-export** | webui 路径字符串不变 |
| **契约测试** | 包测 + webui 测 +（可选）对真实 `:8766` smoke |
| **CLI 默认不变到 M6** | 避免 silent break |
| **Dev UI 按页切** | 避免一次改 10 个 HTML |
| **禁止大爆炸 rename** | `NanobotClient` 别名保留到 M7+ |
| **Feature flag（可选）** | `MINIBOT_CLIENT_SDK=1` 仅在 M2→M3 灰度 |

---

## 7. 配置与命名迁移

| 现状 | 目标 |
|------|------|
| `NanobotClient` | `MinibotClient`（旧名 export） |
| build → `nanobot/web/dist` | `MINIBOT_WEBUI_DIST` / 包内 static |

---

## 8. 各端验收清单

### WebUI

- [ ] 经 `@minibot/client`（直接或 re-export）  
- [ ] Chat WS + sessions 主路径绿  
- [ ] Settings 与 stub 列表一致（`UI_ENTRY`）  

### Dev UI / Insight

- [ ] 各页经 client（含 `.dev.*`）  
- [ ] fallback simulate / runtime 仍可用  
- [ ] 无残留业务关键裸 `fetch("/api/...")`  

### CLI

- [ ] remote 经同合同客户端  
- [ ] embed 仅显式 flag（M6 后）  
- [ ] 文档写清「先起 gateway」  

### Desktop / RN

- [ ] 同 TS 包；Transport / baseUrl 差异隔离在 createClient 选项  
- [ ] RN：不自建聊天后端、不把 DeepSeek 当主路径  

---

## 9. 版本

| 版本 | 含义 |
|------|------|
| **v0.x** | 大纲 + 迁移中 |
| **v1.0** | 包已存在；webui M3 完成；OpenAPI 标注 surface；破坏性变更走 changelog |
| **runtime_surface** | 响应字段标识 minibot |

相关：[`status.md`](./status.md)、[`migration.md`](./migration.md)、[`phases/phase-6.5-fallback.md`](./phases/phase-6.5-fallback.md)。

---

## 10. 建议执行顺序（摘要）

1. **M1** 起包（零风险）  
2. **M2** webui re-export（零用户可感）  
3. **M3** Chat 主路径  
4. **M4** Dev UI 按页  
5. **M5→M6** CLI  
6. **M7** RN + rename  
7. **M8** 删旧代码  

任意一步可停；未完成的端继续走旧路径，**Gateway 始终只有一个 minibot**。

---

## 11. 对外 OpenAPI（RESTful）方案

目标：对外提供 **可下载、可 codegen、可给第三方用的 OpenAPI 3**，同时不把 Insight `/api/dev`、内部实现细节当公共合同。

FastAPI **已经**自带：

| URL | 作用 |
|-----|------|
| `GET /openapi.json` | 机器可读 schema |
| `GET /docs` | Swagger UI |
| `GET /redoc` | ReDoc |

缺口在于：路由多为宽松 `dict`、缺统一 Bearer 声明、**产品面 / 兼容面 / 调试面混在一张图里**、WebSocket 与 OpenAI `/v1` 未单独成「对外产品」。

### 11.1 三张「面」，一张 Gateway

```text
同一 minibot 进程
├── Public Agent API     /webui/bootstrap · /api/sessions* · /api/settings* · …
├── OpenAI Compatible    /v1/chat/completions · /v1/models     （Phase 7）
├── Insight / Dev        /api/dev/*                            （默认不进对外文档）
└── WebSocket            /ws                                   （OpenAPI 3.1 可描述；或单独 AsyncAPI）
```

| 面 | 受众 | 是否进「对外 OpenAPI」 |
|----|------|------------------------|
| **Public Agent API** | webui / RN / CLI / 第三方集成 | ✅ 主文档 |
| **OpenAI Compatible** | openai SDK、脚本、LangChain 等 | ✅ 可独立 tag 或独立 `openapi-v1.json` |
| **Insight `/api/dev`** | 本机 Dev UI | ❌ 默认 exclude；或第二份 `openapi-dev.json` |
| **WebSocket `/ws`** | Chat 主路径 | ⚠️ OpenAPI 能力弱 → 合同仍以 `client-api` + 可选 AsyncAPI |

**原则：** 对外只承诺「打了 `x-minibot-surface: public`（或 v1）且有稳定 Pydantic 模型」的路径；其余视为 unstable。

### 11.2 推荐产物

| 产物 | 内容 |
|------|------|
| `GET /openapi.json` | **默认 = Public Agent API only**（过滤 dev） |
| `GET /openapi-v1.json` | 仅 `/v1/*`（OpenAI 兼容，方便「只接 completions」的客户） |
| `GET /openapi-full.json`（可选） | public + v1 + dev（本机调试） |
| 仓库 `docs/openapi/minibot-public.json` | CI 导出冻结副本，供 codegen / 审 diff |
| `/docs` | Swagger，默认看 public；可用 query `?surface=v1` 切换 |

SDK 关系：

```text
OpenAPI (REST)  ──codegen──►  可选：外部客户的 TS/Python stub
        │
        └── 与 @minibot/client 对齐：client 手写或「生成 + 手写 WS」
            WS 不依赖 OpenAPI codegen
```

`@minibot/client` **不必** 100% 从 OpenAPI 生成（WS 为主路径）；但 **REST 方法签名应以 OpenAPI 为真相源**，避免漂移。

### 11.3 技术做法（FastAPI）

**A. 分路由 / 分 tag**

```text
tags:
  - auth
  - sessions
  - settings
  - workspaces
  - automations
  - v1
  - health
  - # 不要默认暴露: dev / insight
```

**B. 自定义 `openapi()` 过滤**

```python
def custom_openapi():
    schema = get_openapi(...)
    # 去掉 tags=["dev"] 或 path.startswith("/api/dev")
    # 注入 components.securitySchemes.BearerAuth
    return schema
```

**C. 请求/响应改为 Pydantic 模型**（渐进）

- 现状：大量 `dict[str, Any]` → schema 几乎是空的  
- 迁移：每个对外路径补 `response_model=` / Body 模型；**先补 public 高频**（sessions、bootstrap、settings get）  
- 不要求一次改完所有 WebUI 兼容怪招（如 GET 写操作）——怪招可标 `deprecated` 或只留在 full schema  

**D. 安全方案写入 schema**

```yaml
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
    BootstrapSecret:
      type: apiKey
      in: header
      name: X-Minibot-Auth
```

Public 路径：`security: [BearerAuth]`；bootstrap：可选 BootstrapSecret。

**E. WebSocket**

- 短期：OpenAPI 里用 `x-websocket` 扩展或文档链到本文 §4.3  
- 中期：可选 `docs/asyncapi-ws.yaml`（不必阻塞 REST 对外）

**F. OpenAI `/v1`（Phase 7）**

- 独立 router + tag `v1`  
- 模型对齐 OpenAI Chat Completions 子集（含 `stream` SSE）  
- 会话：`X-Session-Id` / body —— 与 Agent Loop 共用  
- 对外叙事：**「要 Agent+工具用 Public API + WS；只要类 Chat Completions 用 `/v1`」**

### 11.4 与 Client API 迁移的衔接

| Client 迁移 | OpenAPI 动作 |
|-------------|--------------|
| M0–M1 | 定 surface；加 `custom_openapi` 过滤 `/api/dev`；Bearer 声明 |
| M2–M3 | sessions / bootstrap **补 response_model**；CI diff `openapi.json` |
| Phase 7 | 上 `/v1` + `openapi-v1.json` + v1-playground |
| M5 CLI remote | CLI/第三方用官方 OpenAPI 或生成的 Python stub |
| M8 | 删除未文档化的野路径或标 deprecated |

### 11.5 渐进落地（不打断现有业务）

```text
O1  过滤 + 元数据（无破坏）
O2  高频路径补模型（兼容旧 JSON 形状）
O3  CI 冻结 public openapi diff
O4  Phase 7 /v1 + 独立 openapi-v1
O5  可选 codegen / 发布到文档站
```

| 步骤 | 做什么 | 业务影响 |
|------|--------|----------|
| **O1** | `custom_openapi`：exclude `/api/dev`；title/version/`runtime_surface`；Bearer securitySchemes；`/docs` 仍可用 | **无**——只改文档图 |
| **O2** | 为 `bootstrap`、`GET/POST /api/sessions`、`webui-thread`、`GET /api/settings` 加 Pydantic；**字段名保持现有 JSON** | 低——多校验、少行为变 |
| **O3** | `pytest` 或脚本：`openapi.json` 与 `docs/openapi/minibot-public.json` golden diff | 防 silently 改合同 |
| **O4** | Phase 7 `/v1`；Swagger 分组；curl + openai SDK 验收 | 新面，旧客户端不动 |
| **O5** | 对外 README「接入方式」：Public vs `/v1`；可选 openapi-generator | 文档 |

**不要做的：** 一上来为了「漂亮 REST」把 WebUI 的 GET-mutating 全改成 POST——会打断 webui；对外新客户用规范动词即可，旧路径标 `x-minibot-legacy: true`。

### 11.6 对外接入话术（给第三方）

1. **Agent 聊天（推荐）**：`GET /webui/bootstrap` → Bearer → REST 管会话 + **WebSocket** 收流式（见 `@minibot/client` / 本文）。  
2. **仅要 Completions 形 API**：`POST /v1/chat/completions`（Phase 7），Bearer 或 API key 策略与 bootstrap 对齐。  
3. **拉规范**：`GET /openapi.json`（public）或仓库内冻结文件。  
4. **不要依赖** `/api/dev/*`（随时变、默认可关）。

### 11.7 验收

- [ ] `/docs` 默认看不到 dev fault 注入等路径  
- [ ] `/openapi.json` 含 Bearer；sessions 有像样 schema（非空 object）  
- [ ] CI 对 public openapi 做 diff  
- [ ] （O4）`openai` SDK 指向 `base_url=http://127.0.0.1:8766/v1` 能 chat  
- [ ] 文档区分 Public Agent API vs `/v1` vs Insight  

相关：[`migration.md`](./migration.md) Phase 7；Client 迁移 §6 M0–M8。
