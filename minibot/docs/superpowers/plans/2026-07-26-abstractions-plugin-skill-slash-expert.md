# 能力四层抽象总纲（Plugin / Skill / Slash / Expert） — 实施纲要

> spec：`specs/2026-07-26-abstractions-plugin-skill-slash-expert-design.md`

本纲要不是单个 phase 的实现清单，而是**统筹四个 phase**（P1-A / P1-11 / P2-13 / P2-15）以及 P2-12 的对齐点，把它们串成同构的一套 overlay 机制。

## 1. 落地拆分

| Phase | 主题 | 交付物 |
|---|---|---|
| **P1-A（新增）** | Skill 升级为一等公民 | `SkillsRegistry` 二版 + `skill()` 工具 + system prompt 清单注入 + 多来源加载 |
| **P1-11** | Slash 分层 + 多来源加载 | `SlashCommandRegistry`（内置 / 插件 / 用户） + 用户可见白名单（默认只 `/compact`） |
| **P2-12** | MCP 接受 overlay | `McpManager.for_session(overlay)` + 单项停用规则 |
| **P2-13** | Plugin 装配 | `PluginService` 扫描 → 交给 3 个 registry；user_config 与变量替换 |
| **P2-15** | Expert overlay | `sessions.expert_id` + `for_session(expert_id)` 组合出 overlay |

## 2. 共享数据流（伪代码）

```python
# 会话级装配（AgentLoop 每一轮开头）
def assemble_context(session):
    plugins   = plugin_service.enabled_plugins()             # 全局
    expert    = expert_service.get(session.expert_id)        # 可选

    skills_visible = skills_registry.list_visible(
        plugin_scope=plugins,
        expert_overlay=expert.refs.skills if expert else [],
    )
    mcp_tools = mcp_manager.for_session(
        workspace=session.workspace,
        overlay=McpOverlay(
            plugin_roots=[p.root for p in plugins],
            extra_server_names=expert.refs.mcp_servers if expert else [],
        ),
    )
    slash = slash_registry.for_user(plugins=plugins)         # slash 只影响 user 输入

    system = build_system_prompt(
        base=..., project=..., memory_snapshot=...,
        skill_listing=skills_visible,
        expert_prompt=expert.system_prompt if expert else None,
        goal=goal_service.active(session.id),
    )
    return AgentContext(system=system, tools=builtin_tools + mcp_tools, slash=slash)
```

**关键**：三个 registry 都提供 `for_session(overlay)` / `list_visible(overlay)` 接口；plugin 和 expert 都通过同一个 overlay 参数走进来。

## 3. 依赖与顺序

```
P0-1 Approval ─┐
P0-3 SQLite  ──┼─> P1-A Skills 一等公民 ──> P1-11 Slash ──> P2-13 Plugin ──> P2-15 Expert
                │
                └─> P2-12 MCP overlay ─────────────────────────────┘
```

- 不能跳过 P1-A 直接做插件：如果 skill 仍是简易 loader，plugin 加载 skill 就没落脚点。
- P2-12 MCP overlay 与 P2-13 可以并行开发。

## 4. 影响面清单（跨 phase 一致性）

以下代码文件会被四个 phase 反复触碰，先在 P1-A 里把接口定死，避免后续 phase 频繁 rebase：

| 文件 | 提供的稳定接口（P1-A 落地） |
|---|---|
| `agent/skills.py` | `SkillsRegistry.list_visible(plugin_scope, expert_overlay) -> list[SkillDescriptor]`（**只列 name+description，不含正文**） |
| `agent/skills.py` | `SkillsRegistry.load_body(name) -> str`（供 `skill()` 工具用） |
| `agent/slash_commands.py` | `SlashCommandRegistry.for_user(plugins) -> dict[name, SlashSpec]` |
| `mcp/manager.py` | `McpManager.for_session(workspace, overlay: McpOverlay) -> list[AgentTool]` |
| `plugins/service.py` | `PluginService.enabled_plugins() -> list[Plugin]`、`disabled_items(kind) -> set[str]` |
| `experts/service.py` | `ExpertService.get(expert_id) -> Expert \| None` |

## 5. 具体调整

对四个已有 phase 的 spec 追加以下条款（已在各 spec 中写入或在下面对应位置补写）：

### P1-11（Slash）追加
- Slash 定义**多来源**：内置 / 插件 slash/*.md / 用户 `~/.minibot/slash/*.md`
- 加载器合并优先级：用户 > 插件 > 内置
- 用户可见白名单：默认只有 `/compact`（配置可扩）；不在白名单的 slash 仍能触发，但不出现在 UI 建议里

### P2-12（MCP）追加
- `McpManager.for_session(workspace, overlay)` 接受两类 overlay：
  - `plugin_roots`：本会话临时启用的插件目录（仍受单项停用约束）
  - `extra_server_names`：expert 按名引用的用户级 server spec

### P2-13（Plugin）追加
- 单项停用键统一格式：`disabled_items = {"mcp": {"<key>"}, "skill": {"<name>"}, "slash": {"<name>"}}`
- 插件 slash 目录 `slash/`；一并纳入 `SlashCommandRegistry`

### P2-15（Expert）追加
- Overlay 参数结构对齐插件：`refs.skills` / `refs.plugins` / `refs.mcp_servers`
- Expert 引用一个 plugin 时等价于"在本会话临时启用它"（走 `plugin_roots` overlay）
- **注意**：expert 不解禁被单项停用的资源；黑名单永远赢

## 6. 术语字典（避免后续文档歧义）

- **AgentTool**：模型可直接调用的能力，唯一运行时能力
- **Skill**：说明书类内容，占 system prompt 极少 token，按名加载
- **Slash command**：用户输入宏，展开成 user prompt，不影响模型 tool schema
- **MCP server**：一组外部 AgentTool 的来源
- **Plugin**：全局打包容器，声明一组 skill + slash + mcp + userConfig
- **Expert**：会话级 overlay + 一段 systemPrompt + 引用的资源清单
- **Overlay**：临时叠加启用的资源集合（skills / mcp / slash / plugin_roots）
- **单项停用**：整体启用某 plugin 但精细屏蔽其中某个资源

## 7. 验收（跨 phase 完成时）

- 只装一个 plugin 就能同时得到它的 skill + mcp + slash
- 创建 expert 绑定到 session 后：新 run 里 system prompt 有 expert 段、mcp tool 列表增加了 expert 引用的 server、`skill()` 能加载 expert 声明的 skill 正文
- Plugin 单项停用某 mcp 后，expert 也不能绕过它
- 用户 slash 与插件同名 slash 冲突时用户版生效
