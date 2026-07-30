# minikb ↔ minibot 集成 (Plan)

> spec：`specs/2026-07-26-minikb-integration-design.md`  
> 定位：作为 minikb 平台 KB-P7 的一部分，也是 minibot 侧的一个"产品能力接入"。  
> 依赖：minibot P0-1 审批、P0-6 provider、P2-13 Plugin（若未落地可先手工放到目录）；minikb KB-P0/P1/P2/P3 已就绪。

## Constraints

- minibot 侧不写文档、不改配置；一切写操作跳到 minikb UI
- API Key 走 keyring，不落 config.json 明文
- minikb 不可达时 UI/工具优雅降级

## File map

| File | Role |
|---|---|
| `minibot/knowledge/client.py` | httpx 客户端 |
| `minibot/knowledge/models.py` | pydantic |
| `minibot/agent/tools/kb.py` | 三个工具 |
| `minibot/api/routes/knowledge.py` | UI 数据接口 |
| `minibot/static/devui/knowledge.html` | 页面 |
| `minibot/static/devui/knowledge.js` |  |
| `minibot/plugins/builtin/knowledge-base/plugin.yaml` | 内置 plugin 定义（可选） |
| `tests/test_kb_client.py` |  |
| `tests/test_kb_tools.py` |  |
| `tests/test_kb_ui_routes.py` |  |

## Task 1 — KbClient

- [ ] httpx AsyncClient 封装；超时 3s / 30s（qa 用长）
- [ ] list/get/retrieve/qa 方法
- [ ] 60s 缓存 KB 列表
- [ ] 401/403 处理
- [ ] 单测：mock httpx

## Task 2 — 工具

- [ ] `kb_list` / `kb_search` / `kb_answer`
- [ ] 审批联动（search 直放，answer 走策略）
- [ ] 工具描述强调"只读检索 + 引用要求"
- [ ] 单测：pipeline 完整

## Task 3 — Dev UI 数据 API

- [ ] `GET /api/kb/list` → 走 KbClient
- [ ] `POST /api/kb/{id}/search` → 走 KbClient
- [ ] `GET /api/kb/config` → 展示配置状态（不返回 key）
- [ ] TestClient

## Task 4 — Dev UI 页面

- [ ] `knowledge.html` 布局（左右两栏）
- [ ] 检索表单 + 结果卡片
- [ ] 空态引导
- [ ] "打开 minikb" 外链

## Task 5 — Plugin 打包

- [ ] `plugin.yaml`
- [ ] user_config 表单校验
- [ ] Enable 时 tools 进入 registry
- [ ] 手工 e2e：装启用 → agent 能调工具

## Task 6 — 观测 & 错误路径

- [ ] 事件 `tool_call{tool:kb_*}` 保留 query 摘要
- [ ] minikb 不可达自动降级 + UI 显示
- [ ] 日志记录 request_id

## Task 7 — 文档

- [ ] README 一节"接入知识库"
- [ ] `docs-plan/phase-p3-kb-integration.md`

## 验收

- 手工：配置 api_key + base_url 后，UI 显示 3 个 KB
- 手工：在 UI 里输 query 拿到命中结果
- 手工：在对话里让 agent "查 xxx" → 触发 kb_search → 命中；qa 需人工放行一次
- 手工：把 api_key 改错 → 工具明确报错，UI 引导重新填
