# P2-12 · MCP 增强 (Design)

> 对齐 `chengxiaobang/apps/backend/src/mcp/*`（含 `oauth/`）

## 1. 目标

在现有 MCP preset（stdio/sse/http）之上：

- **OAuth**：远程 SSE/HTTP server 支持 OAuth 授权码流程
- **变量替换**：`${CLAUDE_PROJECT_DIR}`, `${user_config.<field>}` 等
- **插件声明式 MCP**：一个插件可在 `plugin.yaml` 声明多个 MCP server，随插件启停生效
- **按 workspace 多实例**：spec 引用 `${CLAUDE_PROJECT_DIR}` 时按 workspace 独立启动

## 2. OAuth 支持

`mcp/oauth/`：

- `discover(server_url) -> AuthMetadata`（RFC 8414）
- 授权码流程本地开临时端口接 callback
- Token 存 `~/.minibot/data/mcp_oauth/<server_id>.json`（refresh_token 加密：`cryptography.fernet` 基于本机 keyring 密钥）
- Provider 抽象：`OAuthClientProvider` 供 `mcp` sdk 使用

## 3. 变量替换

`mcp/variable_substitution.py`：

- `${CLAUDE_PROJECT_DIR}` → workspace path
- `${user_config.<name>}` → 插件级配置（P2-13）
- `${env.VAR}` → env var（白名单）
- 替换发生在 spec 载入时，运行时不再动态解释

## 4. 插件声明 MCP

由 P2-13 的 `plugin.yaml` 声明：

```yaml
mcp_servers:
  - id: fs
    label: Filesystem
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "${CLAUDE_PROJECT_DIR}"]
```

- 每插件的 server key = `<plugin>_<server_id>`，避免冲突
- 单项停用列表：`~/.minibot/config.json.disabled_mcp_server_keys`

## 5. 多实例策略

- Spec 若含 `${CLAUDE_PROJECT_DIR}` → 按 workspace 起独立进程
- 否则全局单例
- 缓存 key：`(server_key, workspace_normalized)`

## 6. 热失效

- 用户在设置里增删/启停 → `McpManager.invalidate(session)`
- 现有连接 graceful shutdown 60s 后强杀

## 7. 观测

- `/api/dev/mcp` 已存在，扩展显示 workspace、变量替换后的最终 args、OAuth 状态

## 8. 兼容

- 现有 user MCP preset 保留；新增插件来源与之并存
- OAuth 是可选：http/sse spec 里没写 auth 就走原逻辑

## 9. 错误路径

- OAuth 拿不到 token → server 显示 `oauth_pending`，工具不注入
- 变量替换失败（引用未存在）→ server 状态 `misconfigured`
