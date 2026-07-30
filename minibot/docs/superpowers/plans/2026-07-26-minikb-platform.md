# minikb · 独立知识库平台 (Plan)

> spec：`specs/2026-07-26-minikb-platform-design.md`  
> minibot 侧集成：`specs/2026-07-26-minikb-integration-design.md`（在 minibot P3 阶段落地）

## Global constraints

- Python 3.12 + FastAPI + Postgres + pgvector + Redis + MinIO；不引入 Celery
- Embedding / LLM 走 provider 抽象；本地开发默认 openai + `text-embedding-3-small`；可切 bge
- 每 phase 收工前 `pytest -q` 全绿；e2e smoke 用 docker-compose
- 版本从 0.1.0 起；破坏性改动打 major
- API 前缀 `/v1`；后台管理 API `/admin/v1`；UI 挂 `/ui/`

## 里程碑 → Phase 映射

| Milestone | Phase | 主题 |
|---|---|---|
| KB-M0 | KB-P0 | Skeleton：仓库 / DB / 上传 / 单 chunker / 检索 e2e |
| KB-M1 | KB-P1 | 摄入完备：多 parser、多 chunker、workers、进度 |
| KB-M2 | KB-P2 | 检索完备：keyword、hybrid、rerank、filter、playground |
| KB-M3 | KB-P3 | QA playground：prompt 模板、引用、stream、logs |
| KB-M4 | KB-P4 | 数据源：URL、Feishu、Git（含代码沙箱）、增量 |
| KB-M5 | KB-P5 | 权限：Org / KB 成员 / API Key scopes |
| KB-M6 | KB-P6 | 评估：dataset + Recall@k / MRR / RAG 指标 |
| KB-M7 | KB-P7 | UI 完善 + minibot 集成 |
| KB-M8 | KB-P8 | 运维：compose / 监控 / 备份 / 导入导出 |

---

## KB-P0 · Skeleton

**目标**：能跑通 "创建 KB → 上传 PDF → 自动切片入库 → 命中检索" 的最小闭环。

### 交付

- Monorepo 新增 `minikb/` 子目录
- `docker/docker-compose.yml`：postgres+pgvector、redis、minio、minikb-web、minikb-worker
- Alembic 初始化 + 首个迁移（orgs/users/api_keys/knowledge_bases/documents/chunks/ingest_jobs）
- API：KB CRUD、文件 upload、job 状态查询、`/v1/kb/{id}/retrieve`（vector only）
- Worker：解析（pdf/md/txt）+ recursive chunker + openai embedding + pgvector 索引
- UI：`/ui/kb/` 列表 + 新建；`/ui/kb/{id}/documents`；简单检索表单
- Auth：单 org 默认，API Key 基础实现（generate / list / revoke）
- CLI：`python -m minikb.cli ingest <file> --kb=<slug>` 用于本地调试

### Task 拆分

- [ ] Task 1：仓库骨架 + docker-compose + settings/env
- [ ] Task 2：DB models + Alembic 初始迁移 + pgvector 扩展启用
- [ ] Task 3：Auth（API Key 生成/校验/scopes 骨架）
- [ ] Task 4：KB CRUD 路由 + tests
- [ ] Task 5：Upload 上传 → MinIO + sha256 去重 + documents 记录 + 入队
- [ ] Task 6：Worker 主循环 + parsers (pdf/md/txt) + recursive chunker
- [ ] Task 7：Embedding provider bridge（HTTP 调 openai；env 可切） + 写 pgvector
- [ ] Task 8：Retrieval vector-only 路由 + score 计算
- [ ] Task 9：Ingest job 状态 API + SSE 进度
- [ ] Task 10：Dev UI 三页 + 基础检索表单
- [ ] Task 11：README、Docker README、e2e smoke 脚本
- [ ] Task 12：单测覆盖上述模块

### 验收
- 一条命令起服务，浏览器建库 → 拖入 3 个 PDF → 页面看到状态从 pending 走到 ready → 检索关键词命中
- pytest 全绿

---

## KB-P1 · 摄入完备

**目标**：让摄入 pipeline "全面且可控"。

### 交付

- **Parsers**：pdf(pypdfium2)、docx(mammoth+python-docx)、xlsx(openpyxl)、pptx(python-pptx)、html(readability)、markdown、csv、jupyter、代码文件按语言
- **Cleaners**：Unicode 归一、页眉页脚剔除（PDF 特化）、控制字符、trailing whitespace
- **Chunkers**：recursive、by_heading、semantic、code_aware、table_aware、sliding_window（每策略独立测试）
- **Enrichers**：doc_title + heading_path 前缀；表格→markdown；可选 OCR（tesseract）
- **Ingest Jobs**：多阶段落表（parse/chunk/embed/index），失败重试 + 退避
- **Worker 并发**：RQ 多 queue（cpu/embed/index），可水平扩容
- **管理**：文档级"重新处理""重新 embedding""手工重切片"入口
- **SSE**：`/v1/kb/{id}/ingest/events` 推进度事件
- **切片浏览**：`/ui/kb/{id}/chunks` 可翻页 + 搜索 + 高亮

### Task 拆分

- [ ] Task 1：Parser 抽象 + registry；补齐 8 种格式；单测各 3 个 fixture
- [ ] Task 2：Cleaner 抽象；PDF 页眉页脚检测启发式
- [ ] Task 3：Chunker 抽象 + 6 个实现 + 参数校验；单测覆盖边界
- [ ] Task 4：Enricher pipeline；开关配置
- [ ] Task 5：Ingest job 状态机 + 重试策略 + `attempts` 上限
- [ ] Task 6：Worker 多 queue + 并发度配置 + 优雅退出
- [ ] Task 7：文档级操作 API（reparse/rechunk/reembed）
- [ ] Task 8：SSE 进度事件（复用 minibot 事件契约思路）
- [ ] Task 9：切片浏览页 UI（虚拟滚动 + 关键词高亮）
- [ ] Task 10：性能基准：1k PDF 摄入耗时、embedding QPS
- [ ] Task 11：文档：`docs/ingest.md`

### 验收
- 上传 500 页 PDF 5 分钟内到 ready
- 摄入失败可从 job 表看到具体阶段 + 报错，一键 retry
- 切片页面能看到 heading_path 前缀是否合理

---

## KB-P2 · 检索完备

### 交付

- **keyword**：pg full-text（默认）；配置开启 ES 后走 ES BM25
- **hybrid**：RRF 融合；`weights: {vec:0.6, kw:0.4}` 可调
- **rerank**：抽象 + 两个实现（cohere API / 本地 bge-reranker-v2-m3）
- **filter**：metadata 查询语法（简版 mongo-like）
- **Playground**：并排三种模式命中 + 分数分布 + 命中片段原文高亮跳转
- **降级策略**：向量库故障 → 自动回退关键词

### Task 拆分

- [ ] Task 1：keyword 检索（pg full-text）；索引 + 中英分词
- [ ] Task 2：hybrid RRF；tests 覆盖 tie-break
- [ ] Task 3：Rerank 抽象 + Cohere 实现 + 本地 BGE 实现（可选 extras）
- [ ] Task 4：Filter DSL 解析 + 校验 + pg SQL 生成
- [ ] Task 5：Retrieval Playground UI；并排布局；分数柱状图
- [ ] Task 6：Fallback / 熔断（`retrieval.mode.effective` 返回体透明化）
- [ ] Task 7：`retrieval_logs` 表 + 查询日志页面
- [ ] Task 8：文档：`docs/retrieval.md`

### 验收
- 用 10 条固定 query 对比 vector / keyword / hybrid+rerank 的 Recall@8
- Rerank 前后命中集合与顺序 diff 可视化

---

## KB-P3 · QA Playground

### 交付

- Prompt 模板系统（Jinja2 + variables schema）；每 KB 一份 default
- QA 路由：`POST /v1/kb/{id}/qa`；`stream=true` 时 SSE
- 引用抽取：`[i]` → citations（chunk_id + doc + span）；如缺失自动追问模型补
- **模型选择**：走 minibot providers（HTTP 调 minibot `/v1/chat` 或直连 provider）；playground 可切多套 preset
- QA 日志：query / retrieval / answer / citations / feedback（👍/👎）
- Faithfulness 打分（可选，先规则式：引用 chunk 是否被使用；后续加 LLM-as-judge）

### Task 拆分

- [ ] Task 1：Prompt 模板存储 + Jinja 渲染
- [ ] Task 2：QA 编排：retrieve → prompt → LLM → citations 抽取
- [ ] Task 3：SSE stream 输出
- [ ] Task 4：Playground UI：左检索/右回答/引用弹层
- [ ] Task 5：qa_logs + feedback endpoint
- [ ] Task 6：Faithfulness 规则版
- [ ] Task 7：文档：`docs/qa.md`

### 验收
- 5 分钟内在 UI 里从建库到问答闭环
- 缺失引用的回答会被显式标注并可一键改进

---

## KB-P4 · 数据源与代码沙箱

### 交付

- Connector 抽象；4 个实现：`url`, `feishu`, `git`, `sql`
- Feishu：OAuth2 + tenant_access_token；支持 space / wiki / docx 三种入口；增量按 `updated_time`
- Git：clone + `path_globs` + language_hints；代码沙箱等价于 `kind=code_sandbox`（strict code_aware）
- SQL：自定义连接串 + query；每行/多行 chunk 策略可选
- 定时同步：cron 表达式；失败告警（webhook）
- 数据源 UI：新增 wizard + 状态卡片

### Task 拆分

- [ ] Task 1：Connector 抽象 + registry
- [ ] Task 2：`url` connector（robots 尊重、去广告）
- [ ] Task 3：`git` connector（sparse clone、增量按 commit sha）
- [ ] Task 4：`feishu` connector（tokens 加密存储；三入口）
- [ ] Task 5：`sql` connector（driver 白名单）
- [ ] Task 6：Cron 调度 + 失败重试
- [ ] Task 7：Wizard UI：分步表单 + 预览
- [ ] Task 8：文档：`docs/connectors.md`

### 验收
- 一个飞书 wiki 空间接入后自动增量摄入
- 一个 git 仓 code_sandbox 模式：函数级切片可看

---

## KB-P5 · 权限

- 多 org / user 邀请 / KB 成员分角色
- API Key scopes 全面收紧；细粒度到 KB
- 审计日志（append-only）
- 撤销级联：撤 key / 撤成员立即失效

Task 略；单测覆盖越权路径。

---

## KB-P6 · 评估

### 交付

- `eval_datasets` + `eval_items` 结构；可从 qa_logs 导入或手工上传 CSV
- 指标：Recall@k / MRR / nDCG / faithfulness / answer_relevance / latency
- 运行器：`POST /v1/kb/{id}/eval/run` 异步
- UI：run 列表 + 指标图；两次 run diff

### Task 拆分

- [ ] Task 1：dataset schema + import
- [ ] Task 2：runner：retrieval-only 与 e2e 两种模式
- [ ] Task 3：metrics 实现（IR + RAG）
- [ ] Task 4：UI：仪表盘、diff 视图
- [ ] Task 5：文档：`docs/evaluation.md`

### 验收
- 修改 chunk 参数后跑评估 → 指标变化清晰可见

---

## KB-P7 · UI 完善 + minibot 集成

### 交付

- UI 完善：设置页（chunk 参数、prompt 模板、embedding 模型、成员、危险区）
- **minibot 集成**（详见 `specs/2026-07-26-minikb-integration-design.md`）：
  - minibot 侧 `KbClient`（httpx）
  - 工具：`kb_list`, `kb_search`, `kb_answer`
  - Dev UI 页面 `/ui/knowledge.html`：库列表 + 搜索框 + 结果面板；有"打开 minikb"外链
  - 作为 minibot P2-13 Plugin 打包：`plugin.yaml` 声明工具 + user_config（api_key、base_url）
  - 会话内可选启用（配 Expert overlay）

### Task 拆分

- [ ] Task 1：设置页表单 + 保存/校验
- [ ] Task 2：minikb SDK（Python）
- [ ] Task 3：minibot `KbClient` + 三个工具（走审批策略：write/ingest 需审批，search 无需）
- [ ] Task 4：minibot Dev UI knowledge 页
- [ ] Task 5：Plugin 打包（放在 `~/.minibot/plugins/knowledge-base/`）
- [ ] Task 6：文档：`docs/minibot-integration.md`

### 验收
- minibot UI 能看到已授权 KB 列表并进行搜索测试
- 让 agent "在 KB xxx 里帮我找 yyy" → 触发 `kb_search` → 结果引用

---

## KB-P8 · 运维

- docker-compose 一键起
- Helm chart 骨架
- Prometheus metrics + Grafana 仪表盘 JSON
- 数据备份：pg_dump + MinIO 快照；恢复剧本
- 导入导出：KB 级 zip（含 chunks + embeddings 元数据）
- 升级路径：alembic 自动升级 + 兼容策略

Task 略；重点 e2e 演练一次备份恢复。

---

## 依赖与顺序

```
KB-P0 ──> KB-P1 ──> KB-P2 ──> KB-P3 ──> KB-P4
                          └────────────> KB-P6
KB-P5 独立（第一版可放到 P4 之后）
KB-P7 依赖 KB-P0..P3（有基础 API 就能集成）
KB-P8 收尾
```

**建议关键路径**：KB-P0 → KB-P1 → KB-P2 → KB-P3 → KB-P7（早集成到 minibot 拿反馈）→ KB-P4/P5/P6/P8。

---

## 团队/时间估算（一人节奏，作为参考，不是承诺）

- KB-P0：2 周
- KB-P1：3 周
- KB-P2：2 周
- KB-P3：1.5 周
- KB-P4：3 周
- KB-P5：1.5 周
- KB-P6：2 周
- KB-P7：1.5 周
- KB-P8：1.5 周

合计 ~18 周 MVP+扩展；只做 KB-P0..P3+P7 大致 ~10 周产出面向用户的 alpha。

---

## 风险与对策

- **Embedding 成本**：默认走 openai 会烧钱；给一个"本地 bge-small"路径 + batch。默认 dev 环境跑本地。
- **向量库扩展**：pgvector ≤ 千万级向量够用；超过再引 Milvus/Weaviate，抽象层预留。
- **解析质量**：PDF 是重灾区；给 unstructured + 自研启发式；提供"手工修改切片"兜底。
- **多 embedding 模型迁移**：允许 KB 内多向量列并存，切换时后台重跑而不阻塞。
- **RAG 幻觉**：faithfulness 分数 + 引用完整性硬校验 + 未命中显式说"不知道"。
- **多租户误操作**：API Key scope + 危险动作二次确认。
