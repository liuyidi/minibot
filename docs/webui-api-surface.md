# WebUI 接口面（HTTP + WebSocket）

WebUI 的对外调用集中在两处：

- **HTTP**：`webui/src/lib/api.ts` + `webui/src/lib/bootstrap.ts`
- **WebSocket**：`webui/src/lib/nanobot-client.ts`

后端实现主要在：

- `nanobot/webui/ws_http.py`
- `nanobot/webui/settings_routes.py`
- `nanobot/channels/websocket.py`（WS 帧 → MessageBus → AgentLoop）

鉴权：先 `GET /webui/bootstrap` 拿 `token`，之后 HTTP 带 `Authorization: Bearer <token>`，WS 用 `?token=`。

---

## 1. 启动 / 鉴权

| 方法 | 路径 | 前端 | 后端 |
|------|------|------|------|
| GET | `/webui/bootstrap` | `lib/bootstrap.ts` → `fetchBootstrap` | `ws_http.py` |

Header 可选：`X-Nanobot-Auth`（gateway secret）。

---

## 2. HTTP REST（`lib/api.ts`）

> 多数「写操作」也是 **GET + query**（不是 POST）。

### Sessions

| 方法 | 路径 | 函数 |
|------|------|------|
| GET | `/api/sessions` | `listSessions` |
| GET | `/api/sessions/{key}/webui-thread` | `fetchWebuiThread`（`?limit&direction&before`） |
| GET | `/api/sessions/{key}/file-preview?path=` | `fetchFilePreview` |
| GET | `/api/sessions/{key}/automations` | `fetchSessionAutomations` |
| GET | `/api/sessions/{key}/delete` | `deleteSession`（`?delete_automations=true`） |

### Automations / Skills / Sidebar / Commands / Workspaces

| 路径 | 函数 |
|------|------|
| `/api/webui/automations` | `fetchAutomations` |
| `/api/webui/automations/{enable\|disable\|delete\|run}?id=` | `runAutomationAction` |
| `/api/webui/automations/update?id=` | `updateAutomation`（header: `X-Nanobot-Automation-Values`） |
| `/api/webui/skills` | `fetchSkills` |
| `/api/webui/skills/{name}` | `fetchSkillDetail` |
| `/api/webui/sidebar-state` | `fetchSidebarState` |
| `/api/webui/sidebar-state/update?state=` | `updateSidebarState` |
| `/api/commands` | `listSlashCommands` |
| `/api/workspaces` | `fetchWorkspaces` |

### Settings

| 路径 | 函数 |
|------|------|
| `/api/settings` | `fetchSettings` |
| `/api/settings/usage` | `fetchSettingsUsage` |
| `/api/settings/version-check` | `checkVersion` |
| `/api/settings/update?...` | `updateSettings` |
| `/api/settings/model-configurations/create?...` | `createModelConfiguration` |
| `/api/settings/model-configurations/update?...` | `updateModelConfiguration` |
| `/api/settings/provider/update?...` | `updateProviderSettings` |
| `/api/settings/provider-models?provider=` | `fetchProviderModels` |
| `/api/settings/provider/oauth-login?provider=` | `loginProviderOAuth` |
| `/api/settings/provider/oauth-logout?provider=` | `logoutProviderOAuth` |
| `/api/settings/web-search/update?...` | `updateWebSearchSettings` |
| `/api/settings/network-safety/update?...` | `updateNetworkSafetySettings` |
| `/api/settings/image-generation/update?...` | `updateImageGenerationSettings` |
| `/api/settings/transcription/update?...` | `updateTranscriptionSettings` |
| `/api/settings/cli-apps` | `fetchCliApps` / `fetchInstalledCliApps` |
| `/api/settings/cli-apps/{install\|update\|uninstall\|test}?name=` | `runCliAppAction` |
| `/api/settings/mcp-presets` | `fetchMcpPresets` |
| `/api/settings/mcp-presets/{enable\|remove\|test}?name=` | `runMcpPresetAction` |
| `/api/settings/mcp-presets/custom` | `saveCustomMcpServer` |
| `/api/settings/mcp-presets/import` | `importMcpConfig` |
| `/api/settings/mcp-presets/tools` | `updateMcpServerTools` |

MCP 相关写操作常用 header：`X-Nanobot-MCP-Values`。

### Media（无 `api.ts` 封装）

| 路径 | 用途 |
|------|------|
| `GET /api/media/{sig}/{payload}` | 消息里的图片/视频/文件 URL（`<img>` / markdown） |

后端：`nanobot/webui/media_api.py`。

---

## 3. WebSocket（聊天主路径）

连接：`bootstrap.ws_path` + `?token=`（见 `deriveWsUrl`）。

- 客户端：`lib/nanobot-client.ts`
- 事件类型：`lib/types.ts` 的 `Outbound` / `InboundEvent`

### 客户端 → 服务端

| `type` | 作用 |
|--------|------|
| `new_chat` | 新建会话 |
| `fork_chat` | 从某条 user 消息前 fork |
| `attach` | 订阅已有 `chat_id` |
| `message` | 发消息（可带 media / image_generation / cli_apps / mcp_presets / workspace_scope / turn_id） |
| `set_workspace_scope` | 改 workspace 范围 |
| `transcribe_audio` | 语音转写 |

### 服务端 → 客户端

| `event` | 作用 |
|---------|------|
| `ready` / `attached` | 连接就绪 / 会话已挂上 |
| `message` | 完整回复 / tool_hint / progress / reasoning |
| `delta` / `stream_end` | 流式文本 |
| `reasoning_delta` / `reasoning_end` | 推理流 |
| `file_edit` | 文件编辑预览 |
| `turn_end` | 回合结束 |
| `goal_status` / `goal_state` | 长目标状态 |
| `session_updated` | 会话元数据变更 |
| `runtime_model_updated` | 当前模型变更 |
| `transcription_result` / `transcription_error` | 转写结果 |
| `error` | 错误（如 `workspace_scope_rejected`） |

---

## 4. 按接口读代码的建议路径

```text
UI 组件 / hooks
  → webui/src/lib/api.ts             # REST
  → webui/src/lib/nanobot-client.ts  # WS 发
  → webui/src/hooks/useNanobotStream.ts  # WS 收 → UI 状态
       ↓
nanobot/webui/ws_http.py             # HTTP 路由分发
nanobot/webui/settings_routes.py     # Settings 全套
nanobot/channels/websocket.py        # WS 帧处理 → MessageBus → AgentLoop
```

| 目标 | 从哪开始 |
|------|----------|
| 发消息怎么进 Agent | `Outbound.message` → `channels/websocket.py` → `bus.publish_inbound` → `AgentLoop` |
| 设置页 | `api.ts` 的 `fetchSettings` / `update*` → `settings_routes.py` |
| 历史消息 | `fetchWebuiThread` → `ws_http.py` 的 `webui-thread` → `transcript.py` |

入口清单文件：`lib/api.ts`、`lib/bootstrap.ts`、`lib/nanobot-client.ts`；后端对照 `nanobot/webui/ws_http.py` + `settings_routes.py`。
