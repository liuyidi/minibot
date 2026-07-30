# P2-13 · 插件系统雏形 (Design)

> 对齐 `chengxiaobang/apps/backend/src/tools/plugin-service.ts` + `plugin-commands.ts`

## 1. 目标

引入声明式插件：一个目录 = 一个插件，包含 `plugin.yaml` 声明它提供的 **技能 / MCP server / slash command / userConfig 字段**，可整体启停。

## 2. 目录布局

```
~/.minibot/plugins/<name>/
  plugin.yaml
  skills/
    <slug>/SKILL.md
    <slug>/scripts/*.py
  slash/
    <slug>.md
  assets/
```

## 3. plugin.yaml

```yaml
name: office-suite
display_name: 办公套件
description: docx/pdf/xlsx 处理
version: 0.1.0
homepage: ...
enabled_by_default: false

user_config:
  - name: office_dir
    label: Office 输出目录
    type: string
    default: "~/Documents/minibot"

mcp_servers:
  - id: office-mcp
    type: stdio
    command: ...

skills:
  - path: skills/docx
  - path: skills/pdf

slash_commands:
  - path: slash/docx.md    # 用户可见命令 `/docx`（受 P1-11 白名单约束）

disable:                    # 单项停用
  mcp_servers: []
  skills: []
```

## 4. Runtime

`plugins/service.py`：

- 扫描 `~/.minibot/plugins/` 与 `~/.minibot/user-plugins/`（后者用户手写）
- `list_installed()` / `enable(name)` / `disable(name)` / `set_user_config(name, kv)`
- 单项停用：`disable_item(plugin, kind, id)`
- 事件：`plugin.enabled` / `plugin.disabled`
- 增删热失效：级联刷新技能注册、MCP manager、slash 命令表

## 5. 与其他模块的接口

- `SkillsRegistry.load_all()` 遍历所有 enabled 插件的 `skills/` + workspace `skills/`
- `McpManager.discover()` 拿 enabled 插件的 `mcp_servers` + user servers
- `SlashCommandRegistry.load()` 拿 slash/*.md（受 P1-11 允许列表）
- `AppConfig.plugin_user_config: dict[plugin_name, dict[field, value]]`

## 6. UserConfig 校验

- type: string | number | secret | boolean
- secret 存 keyring；其余存 config.json
- 前端设置页表单渲染（Dev UI 一期做 JSON 编辑器）

## 7. REST

- `GET /api/plugins` / `GET /api/plugins/{name}`
- `POST /api/plugins/{name}/enable` / `.../disable`
- `POST /api/plugins/{name}/user-config`
- `POST /api/plugins/{name}/disable-item` `{kind, id}`

## 8. 安全

- 插件目录默认只读扫描，不执行任意 Python
- 技能中的脚本必须在工具白名单里显式调用；不做 auto-run
- MCP server 命令走用户信任（无沙箱）—— 与 chengxiaobang 一致

## 9. 观测

- `plugin.reload{name}` 事件
- `/api/dev/plugins` 状态摘要
