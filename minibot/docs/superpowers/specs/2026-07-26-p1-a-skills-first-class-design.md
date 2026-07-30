# P1-A · Skills 升级为一等公民 (Design)

> 对齐 chengxiaobang `apps/backend/src/agent/system-reminders.ts` 里的 `ModelVisibleSkill` 注入机制 + `tools/skill-market-service.ts` 的 skill 抽象。

## 1. 目标

把 minibot 现在 141 行的 `agent/skills.py`（"扫目录 + frontmatter"简易 loader）升级到程小帮/nanobot 的一等公民形态：

- **两阶段加载**：system prompt 只放 name+description 清单（每技能 ~1 行）；正文延后按需加载
- **`skill()` 工具**：模型显式点名后把 `SKILL.md` 正文塞进上下文
- **多来源合并**：内置 + 用户级 `~/.minibot/skills/` + 插件 skills 目录
- **稳定接口**：为 P2-13（Plugin）和 P2-15（Expert）预留 `list_visible(overlay)` / `load_body(name)`

## 2. Skill 定义

`~/.minibot/skills/<slug>/SKILL.md`：

```md
---
name: web-summarizer
description: 快速摘要长网页并保留关键链接
always: false            # true 时清单里带 [核心] 标记；即便如此正文仍按需加载
tags: [research]
tools_hint: [web_fetch, web_search]   # 描述性，不做强制校验
version: 0.1.0
---

# Web Summarizer

## 何时用
...

## 步骤
1. ...
2. ...

## 注意事项
...
```

`~/.minibot/plugins/<plugin>/skills/<slug>/SKILL.md` 结构相同，运行时 skill 全名 = `<plugin>/<slug>`。

## 3. 数据模型

```python
@dataclass(frozen=True)
class SkillDescriptor:
    name: str                # 全名（含 plugin 前缀，如果有）
    display_name: str        # frontmatter.display_name 或 name
    description: str
    always: bool
    tags: list[str]
    source: Literal["builtin", "user", "plugin"]
    plugin: str | None       # 来源插件（若有）
    path: str                # 绝对路径
    body_size: int           # SKILL.md 字节数
    version: str | None

@dataclass(frozen=True)
class SkillBody:
    descriptor: SkillDescriptor
    body_text: str           # 已去 frontmatter 的正文
    mtime: float
```

## 4. Registry 接口

```python
class SkillsRegistry:
    def reload(self) -> None
    def list_all(self) -> list[SkillDescriptor]
    def list_visible(
        self,
        *,
        plugin_scope: list[Plugin] | None = None,   # 插件启停范围
        expert_overlay: list[str] = [],              # 额外强制启用的技能名
        disabled: set[str] = frozenset(),            # 单项停用
    ) -> list[SkillDescriptor]
    def load_body(self, name: str) -> SkillBody      # 按需读文件
    def find(self, name: str) -> SkillDescriptor | None
```

Registry 内部：`{name: SkillDescriptor}` + mtime 缓存；`load_body` 不缓存正文（避免占内存）。

## 5. `skill()` 工具

```
tool: skill
args:
  name: str       # 支持 `<plugin>/<slug>` 或纯 `<slug>`（后者要求全局唯一）
returns:
  name, description, body_markdown, source
error:
  not_found | ambiguous_name
```

调用后模型看到的是完整 `SKILL.md` 正文（作为 tool result）；后续对话可自由参考。

## 6. System prompt 注入

在装配阶段（`agent/context.py`）：

```
【可用技能清单】(共 12 个，其中核心 3 个；调用 skill(name) 加载详细说明)
[核心] web-summarizer — 快速摘要长网页并保留关键链接
[核心] docx-cleaner — 清洗 Word 文档格式
       office-suite/pdf-extract — 从 PDF 抽取结构化文本
       github/pr-review — 引导完成 PR 评审
       ...
```

规则：
- `always: true` 加 `[核心]` 标签，仍不加载正文
- 单条目单行；名字 + `—` + description
- 总字符不超过 4 KiB；超出后按（always 优先 → 名字字典序）截断，末尾加 `[+N 个未展示]`

## 7. 多来源合并优先级

同名冲突时（比如插件 A 和用户目录都定义了 `web-summarizer`）：

1. 用户目录 `~/.minibot/skills/`（不带插件前缀）**优先展示**该短名
2. 插件目录仍以 `<plugin>/<slug>` 全名共存
3. 模型用短名调用 → 命中用户版本；要用插件版必须用全名

## 8. `always` 与 overlay 的语义

- `always=true`：在 system prompt 清单里加 `[核心]` 标签，让模型更倾向调用
- `expert_overlay=[...]`：会话内追加这几个技能到清单，等价于对这些技能置 `[核心]`
- 都**不改变**"正文按需加载"这一原则；纯粹是引导

## 9. 与 memory / project instructions 的位置

装配顺序：

```
base system prompt
project instructions (P2-16)
memory 目录快照 (P1-10)
────────────
skills 清单（本 phase）
expert.system_prompt (P2-15)
goal 指令 (P1-9)
env context
tools schema（含 mcp）
```

## 10. 观测 & Dev API

- `GET /api/skills` 列出全部 descriptor（含 body_size、source）
- `GET /api/skills/{name}` 返回 descriptor + 正文预览
- 每次 `skill()` 调用发事件 `skill.loaded{name, source, body_size}`

## 11. 错误路径

- name 不存在 → tool error `skill_not_found`
- 短名冲突（用户没版本、多个插件都有） → `ambiguous_name`
- 正文超过 64 KiB → 只加载前 60 KiB + 追加"[truncated]"

## 12. 迁移

现有 `agent/skills.py` 保留一 phase，`SkillsRegistry` 内部实现替换；对外函数 `SkillsRegistry().list()` 变成 `list_visible()`。老调用点批量修改。
