# minibot 能力四层抽象总纲（Plugin / Skill / Slash / Expert）

> 2026-07-26 · 与 chengxiaobang 五概念做**功能语义对齐**的最小充分集。

## 1. 为什么要立这一层

minibot 目前只有 `tools / mcp / skills` 三种概念，但缺少两样东西：

- **打包 + 启停单位**：能把一组技能/MCP/命令一次性开关，不用逐个配置。
- **会话级角色 overlay**：不同场景下临时切换 systemPrompt 与启用的资源集合。

补上这两层后，minibot 五个概念的关系与 chengxiaobang 对齐；实施时**运行时只有三种真机制**（tool / prompt / 生命周期打包），概念之间不重复实现。

## 2. 四层抽象定义

### 2.1 Skill（技能）— prompt 层

**定义**：一段可按需加载的说明书，配合可选辅助脚本。

**运行时**：
- 启动扫描 `~/.minibot/skills/` + 插件 skills → 生成 `SkillsRegistry`
- system prompt 里注入**技能清单**（`name + description`，不含正文），token 廉价
- 提供内置工具 `skill(name)`：模型点名后**把该技能正文加载进上下文**
- 技能里如果指导跑脚本 → 通过已有 shell/fs 工具执行，不新建 runtime

**边界**：
- 技能 ≠ tool。技能是"如何做某件事的方法论"，tool 是"能力"。
- 技能可以引用 tool、slash、mcp（在正文里写），运行时不校验引用是否存在。

### 2.2 Slash command — user prompt 快捷方式

**定义**：`/xxx` 开头的用户输入的宏展开。

**运行时**：
- 只有极少数进入代码路径（用户可见常驻的 `/compact`）
- 其它 slash **一律翻译成 user prompt 模板**（可用 `$1`/`{arg}` 占位符），拼好后作为正常 user message 进入 loop
- 定义可来自：
  1. 内置代码（`compact`）
  2. 插件目录 `slash/<name>.md`（frontmatter + 模板）
  3. 用户 `~/.minibot/slash/<name>.md`

**边界**：
- Slash 不新增能力，只是**用户端**的输入模板；模型永远看不到 slash 名字，只看到展开后的 prompt。
- Slash 与 skill 的区别：**面向对象不同**。skill 是给模型看的方法论，slash 是给用户敲键盘用的快捷键。

### 2.3 MCP server — 外部 tool 供应商

**定义**：通过 MCP 协议把一组 tool 引入 registry；stdio/sse/http/oauth 传输。

**运行时**：MCP tool 桥接为 AgentTool 注入 `ToolRegistry`，模型看到的和内置 tool 完全一样，只是名字带 `mcp_<server>_<tool>` 前缀。

**边界**：MCP ≡ tools 的一种加载方式，不是新的运行时抽象。

### 2.4 Plugin（插件）— 打包 + 生命周期单位

**定义**：一个目录 = 一个插件，声明式地组合若干 skill / MCP server / slash command / userConfig 字段。

**运行时**：
- 扫描 `~/.minibot/plugins/<name>/plugin.yaml`
- 启用 → 该插件所有声明的资源一起进入各自注册表
- 停用 → 一起退出
- 支持**单项停用**：整体启用 + 精细屏蔽某个 mcp_server 或某个 skill

**边界**：
- Plugin **不引入运行时新概念**，只是"整体启停 skill + mcp + slash + userConfig"的容器。
- 作用域是**全局**（这台 minibot 能干啥），一次配置多次使用。

### 2.5 Expert（专家）— 会话级角色 overlay

**定义**：`expert.json` = 一段 systemPrompt + 一段 starterPrompt + 按名字引用的插件/技能/MCP 清单 + 可选头像。

**运行时**：
- session 可绑定一个 expert（`sessions.expert_id`）
- 该 session 的每一 run 装配阶段：
  - system prompt 追加 `expert.system_prompt`
  - `SkillsRegistry.for_session()` 与 `McpManager.for_session()` 接受 expert overlay，**在会话内额外启用**引用的资源
- 不复制资源，不新增运行时能力
- overlay 不能绕开插件的单项停用黑名单（权限归平台）

**边界**：
- Plugin：全局 / 长期 / "我这台机器有什么"
- Expert：会话 / 临时 / "这场对话我是谁 + 用哪几样"

## 3. 关系全景图

```
                     ┌────────── 三个真实的运行时机制 ──────────┐
                     │  Tool 注册表        Prompt 注入          生命周期打包
                     │   (AgentTool)      (system + user)         (yaml/json)
                     └──────────────┬──────────────┬────────────────┬─────────┘
                                    │              │                │
        ┌────────── Tool ───────────┤              │                │
        │   ├── 内置 tool                          │                │
        │   └── MCP 桥接 tool                      │                │
        │                                          │                │
        │                            ┌── Skill ────┤                │
        │                            │  (说明书,按需加载)            │
        │                            │                              │
        │                            └── Slash ────┤                │
        │                               (user prompt 宏)             │
        │                                                            │
        │                                             ┌── Plugin ───┤
        │                                             │  全局打包    │
        │                                             │              │
        │                                             └── Expert ────┘
        │                                                会话级 overlay
        │                                                (含一段 systemPrompt)
```

**同构关系**：Plugin 与 Expert 用**同一套** overlay 机制（覆盖 skills+mcp+slash），差异只在**作用域**（全局 vs 会话）和**是否额外携带一段 systemPrompt**（Expert 有，Plugin 没有）。

## 4. 配置目录约定

```
~/.minibot/
  config.json                # 全局配置（presets、启用插件、user_config）
  workspace/                 # 默认 workspace
    .../
  memory/                    # 长期记忆（P1-10）
  sessions/                  # SQLite 前的历史（P0-3 迁移后归档）
  data/                      # sqlite / approvals / file_changes / mcp_oauth
  skills/                    # 独立技能（不属于任何插件）
    <slug>/SKILL.md
  slash/                     # 用户级 slash 命令
    <name>.md
  plugins/                   # 用户装的插件
    <plugin>/plugin.yaml
    <plugin>/skills/
    <plugin>/slash/
  experts/                   # 专家
    <name>/expert.json
    <name>/avatar.png
```

## 5. 装配顺序（同一 run 内）

```
0. base system prompt（identity + workspace bootstrap + memory 快照）
1. project instructions（P2-16，如 CLAUDE.md）
2. plugin skills 列表（全局 enabled 插件 + 用户 workspace/skills）
3. expert 附加 skills 列表（会话 overlay）
4. expert.system_prompt
5. goal 指令（P1-9，如果 active）
6. run 环境上下文（时间戳、平台等）
7. tools schema（内置 + MCP + plugin MCP + expert overlay MCP）
```

`skill(name)` 被调用时把技能正文延后加载，不占前置 token。

## 6. 与既有 phase 的映射

| 抽象层 | 对应 phase | 说明 |
|---|---|---|
| Skill（升级为一等公民） | **新增 P1-A** | 现有 `agent/skills.py` 是简易 loader，缺 `skill()` 工具、缺注入清单、缺插件源；升级为一等公民并统一 registry |
| Slash | P1-11 | 已有 spec；本总纲补充"多来源加载"（内置/插件/用户） |
| Plugin | P2-13 | 已有 spec；本总纲明确它对应 4 类资源 |
| Expert | P2-15 | 已有 spec；本总纲明确"运行时同构 Plugin，只是作用域" |
| MCP overlay 支持 | P2-12 | 已有 spec；补充"接受会话级 overlay 参数" |

## 7. 命名与代码约定

- Plugin/Expert 的 "refs" 用**名字**引用，不用路径/URL（便于打包搬运）
- Skill 名字与 SKILL.md frontmatter 中的 `name` 一致；插件内 skill 完整名 = `<plugin>/<skill>`
- Slash 名字全局唯一；冲突时用户级 > 插件级（用户覆盖）
- MCP server key = `<plugin>_<server_id>`；用户级不加前缀

## 8. 决策与非目标

**明确采纳**：
- 保留"skill vs slash"分层（受众不同：skill 给模型，slash 给用户）
- Plugin 与 Expert **不合并**（作用域不同、意图不同，代码可复用 overlay，但概念分开利于叙事和 UI）

**不做**：
- 不做携程门户市场服务端代理
- 不做"知识库"（用 skill 承载领域说明书已经够）
- Plugin 不支持任意 Python 代码热注入；只允许通过 skill/mcp/slash 三条明路提供能力
