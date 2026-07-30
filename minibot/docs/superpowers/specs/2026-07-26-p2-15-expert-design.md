# P2-15 · Expert (Design)

> 对齐 `chengxiaobang/apps/backend/src/experts/*` + `docs/expert.md`

## 1. 目标

Expert = 角色 systemPrompt + 按名引用的插件/技能/MCP + 头像。会话可绑定一个 expert，运行时叠加启用引用的资源，不复制资源注册表。

## 2. 存储

```
~/.minibot/experts/<name>/
  expert.json
  avatar.png (optional)
```

`expert.json`：

```json
{
  "name": "data-analysis",
  "display_name": "数据分析专家",
  "description": "完成数据清洗、分析和可视化",
  "tags": ["数据分析"],
  "system_prompt": "你是数据分析专家...",
  "starter_prompt": "我要分析【XXX 数据】...",
  "refs": {
    "plugins":   ["office-suite"],
    "skills":    ["docx-cleaner", "web-summarizer"],
    "mcp_servers": ["fs", "office-suite_office-mcp"],
    "user_mcp_specs": []
  }
}
```

## 3. 数据模型

```python
class Expert(BaseModel):
    name: str
    display_name: str
    description: str
    tags: list[str]
    system_prompt: str
    starter_prompt: str | None
    refs: ExpertRefs

class ExpertRefs(BaseModel):
    plugins: list[str] = []
    skills: list[str] = []
    mcp_servers: list[str] = []
    user_mcp_specs: list[str] = []
```

Session 增加 `expert_id`（沿用 sqlite `sessions.expert_id`）。

## 4. Overlay 装配

会话开始一轮时：

- `overlay.plugin_roots` = 该 expert 引用的 plugin roots（**不解禁**被单项停用的资源）
- `overlay.skill_names` = 强制启用的技能名
- `overlay.mcp_servers` = 该 expert 声明的 MCP，交给 McpManager 的 overlay 参数
- `system_prompt` 追加 `expert.system_prompt`

## 5. 工具与创建入口

内置技能 `expert-creator`（chengxiaobang 也是这样）：

- 引导用户填 expert.json 各字段
- 完成后 `POST /api/experts` 落盘

## 6. REST

- `GET /api/experts` / `GET /api/experts/{name}`
- `POST /api/experts` / `PATCH /api/experts/{name}` / `DELETE /api/experts/{name}`
- `POST /api/sessions/{id}/expert` `{name}` → 绑定
- `DELETE /api/sessions/{id}/expert` → 解绑

## 7. Starter prompt

- 绑定 expert 后如果 session 无消息，UI 可以显式插入 starter_prompt 作为草稿
- 不自动发送

## 8. 与 plan/goal 关系

- Expert system prompt 与 goal 指令并存，goal 指令**在后**（避免被 expert 覆盖）
- plan 模式 mutating guard 仍然生效
