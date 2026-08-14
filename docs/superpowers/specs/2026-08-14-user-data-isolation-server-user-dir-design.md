# 服务器用户目录隔离 + 本地模式预留接口

**Date:** 2026-08-14  
**Status:** design approved, implementation pending  
**Scope:** minibot server runtime, auth identity binding, per-user persistence, IM config, session/state isolation

## 背景

现在 minibot 已经接入了用户体系，接下来要把“用户是谁”真正落实到数据归属上。

这轮的目标不是把数据搬进数据库，而是继续保持文件落盘，同时做到：

1. 服务器上按用户目录隔离。
2. IM 配置、会话、审批、配对、用量、媒体、工作区等都按用户隔离。
3. 同一个 minibot 进程可以同时服务多个用户，各自的 Feishu / Weixin 连接互不干扰。
4. 未来如果要做“本地模式”，不需要推翻当前的存储结构，只需要替换底层的用户根目录解析方式。

## 这轮要做的事

- 以 mini-auth 的用户 `sub` 作为唯一用户标识。
- 把现有单一的 server data 目录，拆成 `data/users/<user_id>/...`。
- 把当前 AppState 里的全局状态，拆成按用户加载的 UserRuntime。
- 让 API / WebSocket / IM 事件都带上 user 维度，避免串号。
- 保留一个“用户数据根目录解析器”抽象，方便未来切换成 local mode、desktop mode 或别的存储后端。

## 不做的事

- 不引入数据库来存用户对话与配置。
- 不做云端同步。
- 不做跨设备账号漫游。
- 不把本地模式做成这轮可切换的正式产品能力。
- 不改 mini-auth 的用户数据库职责，mini-auth 仍只负责认证与身份。

## 核心原则

1. 身份和数据归属分离。
   - mini-auth 提供 `sub`。
   - minibot 用 `sub` 做用户根目录和运行时隔离键。
2. 所有用户数据默认文件落盘。
   - 对话、IM、审批、配对、用量、媒体、cron、用户模型配置都在用户目录里。
3. 平台级秘密仍然只在进程环境变量中。
   - 例如平台模型密钥、基础设施级别的服务密钥。
   - 这些不属于用户目录。
4. 用户态配置和运行时状态必须可重建。
   - 进程重启后能根据用户目录重新扫描并恢复。
5. 未来本地模式只替换“用户根目录从哪里来”。
   - 上层的 SessionStore / ConfigStore / ChannelManager 不知道自己是 server mode 还是 local mode。

## 统一的身份模型

### 当前要求

用户体系接入后，minibot 需要把当前请求绑定到一个明确的 principal。

建议分两类 principal：

- `user`: 来自 mini-auth 的真实用户，携带稳定的 `user_id`。
- `local`: 没有 mini-auth 或本地单机模式下的保留身份。

### 规则

- 服务器多用户模式下，用户数据接口只接受 `user` principal。
- `AUTH_SECRET` 只能作为历史兼容或系统级 bootstrap，不应再访问真实用户目录。
- 如果当前请求没有 `sub`，就不能落到某个真实用户目录里。
- 用户目录名不要直接依赖 email，永远用稳定的 `sub`。

### 建议实现

- `CurrentUser` / `RequestPrincipal` 返回：
  - `kind`
  - `user_id`
  - `display_name`
  - `email`
  - `avatar_url`
- `user_id` 的 canonical 形式使用 mini-auth 的 `sub`。
- 路径上只允许安全编码后的目录名，不直接拼原始输入。

## 目录布局

### 根目录

在 server mode 下，数据根目录继续放在 `MINIBOT_SERVER_DATA_DIR` 下，但其内部改成：

```text
{data_dir}/
  users/
    <user_id>/
      config.json
      sessions/
      cron/
      pairing/
      approvals/
      usage/
      media/
      workspace/
      mcp/
      logs/
      runtime/
      migrations.json
```

### 各目录职责

| 目录 | 内容 |
|------|------|
| `config.json` | 该用户的应用配置：IM 配置、模型配置、MCP 配置、默认权限等 |
| `sessions/` | 会话与消息持久化 |
| `cron/` | 用户级定时任务 |
| `pairing/` | 配对、绑定、授权记录 |
| `approvals/` | 审批与持久化 HITL 状态 |
| `usage/` | 用户级用量、配额、统计 |
| `media/` | 上传附件、转录产物、临时媒体 |
| `workspace/` | 该用户的默认工作区根目录 |
| `mcp/` | 用户级 MCP 配置与缓存 |
| `logs/` | 用户级运行日志或审计索引 |
| `runtime/` | 运行时缓存、连接状态、派生索引 |
| `migrations.json` | 用户目录迁移状态与版本记录 |

### 兼容原则

- 旧版单目录数据不是直接丢弃。
- 如果发现旧 `config.json` 或旧 `sessions/`，先迁移到某个明确 owner 的 `users/<user_id>/` 下。
- 迁移动作必须是幂等的。

## UserRuntime 设计

### 目标

把原来全局的 AppState，拆成一个用户一个 runtime。

### 建议结构

```text
UserRuntime
  - user_id
  - config_store
  - session_store
  - agent_loop
  - channel_manager
  - cron_service
  - approval_store
  - usage_store
  - pairing_store
  - media_store
  - mcp_store
  - workspace_root
  - locks
```

### 运行方式

- 请求进来时，先解析当前 principal。
- 再通过 `UserRuntimeRegistry.get(user_id)` 获取或懒加载 runtime。
- 同一个 `user_id` 只保留一个活跃 runtime。
- 不同用户的 runtime 可以同时存在、同时连着自己的 IM 连接。

### Registry 行为

- 按 `user_id` 做缓存键。
- 首次访问时创建 runtime。
- 进程启动时可扫描 `data/users/*/` 并预热已启用的连接。
- 用户目录变更后，只重载该用户，不影响其他用户。

## IM 配置按用户隔离

这轮里，IM 配置明确改成用户级。

### 包含的内容

- Feishu / Weixin 的 app 配置
- token / secret / webhook 之类的接入信息
- 绑定关系
- 当前启用状态
- 频道到用户 runtime 的路由

### 关键要求

1. 同一台服务器上可以同时有多个用户的 IM 连接在线。
2. 每个 IM 事件进入后，必须先确定它属于哪个 `user_id`。
3. 不能让一个用户的事件流到另一个用户的 session / assistant / config。
4. IM 平台的凭据不能在用户之间共享“默认配置”，除非显式迁移或管理员操作。

### 路由建议

- ChannelManager 以 `user_id` 为一级键。
- `chat_id` / `conversation_id` 只在用户内部唯一。
- WebSocket 的 bus / session attachment 也要带 `user_id`，避免同名会话串线。

## 数据与 API 归属

### 必须用户级的内容

- 会话内容
- 会话元数据
- IM 配置
- pairing 状态
- approvals
- usage / quota
- 用户模型配置
- 用户 MCP 配置
- media / uploads
- workspace 默认根
- cron / automations

### 平台级保留

- 平台模型密钥
- 基础设施密钥
- 运行进程本身的 bootstrap secret

### API 规则

- 获取、创建、更新、删除用户态资源时，只允许操作当前 principal 所在的用户目录。
- 访问别的用户资源，返回 404 或 403，不要泄露该用户是否存在。
- 读取列表型 API 时，默认只能看到自己的数据。

## 迁移策略

### 迁移目标

把现在单目录下的现有数据，安全地迁移到某个明确 owner 的用户目录里。

### 迁移约束

- 必须幂等。
- 必须可重入。
- 不能覆盖已有用户目录中的新数据。
- 一旦发生冲突，要失败并保留现场，而不是静默覆盖。

### owner 选择

这轮先按“服务器管理员指定 owner”迁移旧数据。

建议通过环境变量指定：

```text
MINIBOT_SERVER_LEGACY_OWNER_USER_ID=<mini-auth-sub>
```

含义：

- 如果配置了这个值，旧单目录数据会迁到这个用户下。
- 如果没有配置，旧数据保持原样，不自动暴露给新用户。
- 这样可以避免把历史数据错误地分发到所有新用户。

### 迁移内容

- `config.json`
- `sessions/`
- `media/`
- `workspace/`
- 旧的 pairing / approvals / usage / cron 数据

### 路径引用处理

如果旧数据里有指向旧全局目录的绝对路径，需要在迁移时尽量 rewrite 到新用户目录下。

如果某些路径无法安全迁移，应该标记为“待人工处理”，不要默认吞掉。

## 本地模式预留接口

这轮不做本地模式产品化，但要为它留门。

### 需要抽象的点

1. 用户根目录解析
   - server mode: `data/users/<sub>/`
   - local mode: 可能是 `~/.minibot/local/` 或当前工作目录下的独立目录
2. 当前 principal 来源
   - server mode: mini-auth
   - local mode: 本机登录态或无登录态
3. 用户 runtime 创建方式
   - 上层都通过 factory / registry，不直接 `Path(...)`

### 建议接口

```text
UserRootResolver.resolve(principal) -> UserRoot
UserRuntimeFactory.create(user_root) -> UserRuntime
```

### 要求

- 上层调用方不关心数据到底落在服务器用户目录还是本地目录。
- 业务 store 只接受抽象出来的 root，不接受硬编码路径。
- 不要把“server 模式”写死进 session store、config store、channel manager 里。

## 安全与隔离不变量

1. 任何用户请求只能看到自己的目录。
2. 目录路径必须经过规范化和边界校验。
3. 用户 ID 不能通过拼接导致路径穿越。
4. IM 事件不能跨用户注入。
5. 用户 runtime 之间不能共享可变状态，除了只读的平台 catalog 和全局密钥读接口。
6. 迁移过程不能覆盖已经存在的新用户数据。

## 预期实现切面

实现时大概率会拆到这些位置：

- auth principal 解析
- `AppState` / runtime 初始化
- config / session / approval / usage / media store
- IM channel manager
- websocket session routing
- migration bootstrap
- settings / UI 的用户级配置读写

## 验收标准

1. mini-auth 用户 A 登录后，只能看到自己的 sessions、IM 配置和用户设置。
2. mini-auth 用户 B 登录后，不会看到用户 A 的 session、IM 连接或审批记录。
3. 同一进程下，两个不同用户的 Feishu / Weixin 连接都能保持在线。
4. 会话、IM 配置、审批、配对、用量、媒体、工作区都落到各自用户目录。
5. 旧单目录数据在配置了 `MINIBOT_SERVER_LEGACY_OWNER_USER_ID` 后能迁到指定用户。
6. 没有配置 legacy owner 时，旧数据不会被新用户自动读取。
7. 目录解析层可替换，不需要改动业务 store 的主体逻辑，就能为未来本地模式换根目录实现。

## 备注

这份设计的重点是“先把服务器上的用户隔离做实”，同时让后续的 local mode 只需要换掉 root resolver，而不是重做一套数据模型。
