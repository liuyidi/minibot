# minikb ↔ minibot 集成 (Design)

> 2026-07-26 · 独立于 minikb 平台核心；此处只描述 **minibot 侧薄集成层**。

## 1. 目标

minibot 用户不需要知道 minikb 内部；对他们而言：

- 侧栏一个"知识库"入口 → 看到自己有权限的库
- 页面里能对每个库做**关键词搜索测试**（相当于 minikb 的 retrieval playground 精简版）
- 对话中 agent 能主动调用 `kb_search`, `kb_answer`, `kb_list` 三个工具
- 通过 P2-13 Plugin 一键启停

## 2. 数据流

```
minibot renderer/CLI
    │  UI 用 REST 调 minibot 本地后端
minibot backend
    │  KbClient(httpx) → minikb REST /v1
    │  API Key 来自 user_config（走 keyring/secret store）
minikb backend
    │  KB CRUD read / retrieve / qa
```

- minibot **不做写操作**（不上传文档、不修改成员），写操作都跳到 minikb UI
- 读操作：list KBs、retrieve、qa（受 API Key scope 约束）

## 3. 客户端

```python
class KbClient:
    def __init__(self, base_url: str, api_key: str, timeout: int = 30): ...
    async def list_kbs(self) -> list[Kb]: ...
    async def get_kb(self, kb_id: str) -> Kb: ...
    async def retrieve(self, kb_id: str, query: str, top_k: int = 8,
                       mode: str = "hybrid", filter: dict | None = None) -> RetrieveResult: ...
    async def qa(self, kb_id: str, query: str, *, stream: bool = False, params: dict | None = None): ...
```

- 缓存 KB 列表 60s（避免每次 UI 刷新都打后端）
- 401 / 403 时清缓存 + emit 事件让 UI 引导重新配 key

## 4. 工具

三个内置工具，全部走 P0-1 审批策略（默认允许 search/list，qa 需 require_human 或 smart-approval 自动放行）。

```
kb_list()
  → [{id, name, description, kind, size, updated_at}]

kb_search(kb_id, query, top_k?=5, mode?="hybrid")
  → hits: [{doc_title, chunk_id, score, text, uri}]

kb_answer(kb_id, query, top_k?=6)
  → { answer, citations: [{doc_title, uri, chunk_id}] }
```

工具描述中明确"只做只读检索"；把 hint 引导给 UI 完成写操作。

## 5. Dev UI 页面

`/ui/knowledge.html`（沿用 minibot 现有 UI 风格）：

- 顶部：API Key 配置状态、minikb base_url、外链跳转"打开 minikb"
- 左侧：库列表（分组 by kind: general / code_sandbox / feishu / structured / wiki）
- 右侧：选中库 → 简易检索表单（query / top_k / mode）
- 命中结果卡片：doc_title、score、text 摘要、点击复制 chunk_id、点击跳 minikb 原文

## 6. Plugin 打包（走 P2-13）

`~/.minibot/plugins/knowledge-base/plugin.yaml`：

```yaml
name: knowledge-base
display_name: 知识库
description: 连接 minikb 平台，让 agent 检索企业知识
version: 0.1.0
enabled_by_default: false

user_config:
  - name: minikb_base_url
    label: minikb 地址
    type: string
    default: "http://localhost:8080"
  - name: minikb_api_key
    label: API Key
    type: secret

tools:
  - kb_list
  - kb_search
  - kb_answer

slash_commands: []
mcp_servers: []
```

- 未配置 api_key 时工具在 registry 里显示 `disabled`，模型看不到
- 换 key 立即热失效

## 7. 与 Expert 的协作

在 P2-15 Expert overlay 里：

```json
{
  "name": "kb-researcher",
  "system_prompt": "你在 minikb 里做检索，回答必须给引用...",
  "refs": {
    "plugins": ["knowledge-base"],
    "skills": ["kb-search-strategy"]
  }
}
```

绑定该 expert 的 session 里，`kb_*` 工具就会显式启用；其它会话不受影响。

## 8. 配置来源与安全

- API Key 通过 minibot user_config（`type: secret`）走系统 keyring
- base_url 白名单：默认允许 http/https；本地允许 http://localhost
- 请求头 `Authorization: Bearer <api_key>` + `X-Minibot-Session-Id`（供 minikb 审计）
- 明确不接受在 URL 上带 key

## 9. 观测

- 每次 `kb_*` 工具调用触发 minibot 事件 `tool_call{ tool: kb_search, ... }`；参数保留 query 前 200 字
- retrieval 失败时把 minikb 返回体错误码透明化到 tool result
- 若 minikb `/health` 不健康：工具 result 直接返回失败，指导用户去 minikb UI 检查

## 10. 测试要点

- API Key 未配置 → 工具在 registry 显示禁用
- API Key 错误 → tool result 报 401 并附带修复引导
- minikb 不可达 → 3s 超时 + 明确错误
- 工具与审批联动：kb_answer 触发 require_human，人工放行后正常执行
