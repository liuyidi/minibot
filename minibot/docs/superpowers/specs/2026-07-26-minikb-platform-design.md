# minikb · 独立知识库平台 (Design)

> 2026-07-26 · 与 minibot 并列的独立后端服务；对标火山引擎 Viking / Dify / RAGFlow。  
> 定位：**minibot 只做"库列表 + 搜索 + 测试"的消费方**；minikb 是承载文档、切片、向量、检索、问答的**独立平台**。

## 1. 目标与边界

- **是**：面向 agent / 应用的通用知识库后台（PaaS 风格）。多租户、多知识库、多数据源、可插拔切片与检索、可评估。
- **是**：与 minibot **通过 HTTP + API Key** 集成，minibot 不感知内部实现。
- **不是**：不做 IM 前台、不做用户运营；不复制向量数据库本身（用 pgvector）。
- **不是**：不做企业 SSO/审计的高级形态（第一版留出接口，实现在后期）。

## 2. 平台能力全景

```
┌───────────── 用户/管理员 ──────────────┐
│  minikb Web UI（列表 · 上传 · 切片可视化 · 检索 & QA playground · 评估）
└───────────┬─────────────────────────────┘
            │ REST + WebSocket + SSE
┌───────────▼─────────────────────────────┐
│  minikb API（FastAPI 单体）
│  ├─ Auth（JWT / API Key）
│  ├─ Knowledge Base CRUD
│  ├─ Document 上传 / 状态 / 重新处理
│  ├─ Chunk 查询 / 编辑 / 重建
│  ├─ Retrieval Playground（vector / keyword / hybrid / rerank）
│  ├─ QA Playground（RAG，模型走 minibot providers）
│  ├─ Evaluation（数据集 + 指标）
│  └─ Members / API Keys
└──┬────────┬────────┬────────┬────────┬─┘
   │        │        │        │        │
   ▼        ▼        ▼        ▼        ▼
Postgres  MinIO/S3  Redis   pgvector   ES
(元数据)  (原文件)  (队列)  (向量索引) (BM25/全文,可选)

┌─────────── Ingest Workers（RQ / Celery） ───────────┐
│  Parser → Cleaner → Chunker → Embedder → Indexer     │
└─────────────────────────────────────────────────────┘

┌─────────── Connectors（异步拉取） ─────────────────┐
│  上传 · URL · Feishu · Git · 代码沙箱 · SQL/API 自定义 │
└────────────────────────────────────────────────────┘

┌─────────── 消费方 ─────────────────────────────────┐
│  minibot（tool: kb_search / kb_answer）              │
│  其它应用（同一套 API Key + REST）                    │
└────────────────────────────────────────────────────┘
```

## 3. 数据模型（Postgres 主表）

```sql
-- 组织与成员（第一版可留一个默认 org）
orgs(id, name, created_at)
users(id, email, name, avatar_url, created_at)
org_members(org_id, user_id, role[owner|admin|member])

-- API Key
api_keys(id, org_id, prefix, hashed_secret, name, scopes jsonb, created_at, last_used_at, disabled)

-- 知识库
knowledge_bases(
  id, org_id, name, slug UNIQUE per org, description,
  kind ENUM[general, code_sandbox, feishu, structured, wiki],
  owner_user_id, visibility ENUM[private, org, public],
  meta jsonb,                    -- 飞书链接 / 沙箱仓库 / 附加标签
  created_at, updated_at,
  stats jsonb                    -- 文档数、切片数、索引大小等（异步更新）
)
kb_members(kb_id, user_id, role[owner|editor|reader])

-- 数据源
data_sources(
  id, kb_id, kind ENUM[upload, url, feishu, git, sql, custom],
  config jsonb,                  -- 各自 connector 的参数（脱敏后展示）
  status ENUM[idle, syncing, error], last_sync_at, next_sync_at, cron
)

-- 文档（一次成功摄入的产物）
documents(
  id, kb_id, data_source_id, external_id,
  title, uri, mime, size_bytes, sha256,
  status ENUM[pending, parsing, chunking, embedding, ready, failed],
  error text,
  meta jsonb,                    -- 页数、作者、创建时间、原始路径
  created_at, updated_at
)

-- 切片
chunks(
  id, document_id, kb_id, seq,
  text text,
  html text,                     -- 富文本 preview（可空）
  tokens int,
  meta jsonb,                    -- {heading_path, page, section, source_span}
  embedding vector(1536),        -- pgvector
  content_hash bytea             -- 去重
)
CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
CREATE INDEX ON chunks USING gin (to_tsvector('simple', text));   -- BM25 fallback

-- 摄入任务（用于 UI 进度条 + 重试）
ingest_jobs(
  id, kb_id, document_id, kind ENUM[parse, chunk, embed, index, delete],
  status ENUM[queued, running, ok, failed],
  attempts int, last_error text,
  started_at, ended_at, meta jsonb
)

-- 检索/问答日志（可关分析）
retrieval_logs(id, kb_id, query, params jsonb, hits jsonb, elapsed_ms, created_at, actor)
qa_logs(id, kb_id, query, retrieval_log_id, answer, citations jsonb, model, elapsed_ms, created_at, actor, feedback)

-- 评估
eval_datasets(id, kb_id, name, description, size)
eval_items(id, dataset_id, query, expected_answer, expected_chunk_ids jsonb)
eval_runs(id, dataset_id, params jsonb, metrics jsonb, created_at)
```

## 4. Ingest Pipeline

**阶段线（每一步都可回溯，落 `ingest_jobs`）**：

```
[Upload/Fetch] → Raw (S3, sha256 dedup)
     ↓
[Parse]        → 提取纯文本 + 结构（标题层级、页码、表格、图注）
     ↓
[Clean]        → 去页眉页脚、去水印、去噪、规范化 unicode
     ↓
[Chunk]        → 多策略（下节）
     ↓
[Enrich]       → 上下文化：加"文档标题+章节路径"prefix；表格转 markdown；图片走 OCR（可选）
     ↓
[Embed]        → 走 minibot providers embedding endpoint
     ↓
[Index]        → 写 pgvector；同步写 ES（可选）
     ↓
[Verify]       → 抽样检索自检 + stats 更新
```

**Parser 白名单**（可插件化）：pdf(pypdf2/pdfminer/unstructured)、docx(mammoth)、xlsx(openpyxl)、pptx(python-pptx)、markdown、html(readability)、txt、csv、Jupyter、代码文件按语言 AST。

**Chunker 策略**（每 KB 独立配置）：

| 策略 | 场景 | 参数 |
|---|---|---|
| `recursive` | 通用 | max_tokens, overlap, separators |
| `by_heading` | 结构化文档（md/docx） | max_tokens, keep_heading_path |
| `semantic` | 段落语义边界 | model, sim_threshold |
| `code_aware` | 代码沙箱 | language, ast_unit(function/class/module) |
| `table_aware` | 表格 | flatten_to_row|per_column|window |
| `sliding_window` | 会议纪要/对话 | window_size, stride |

**Enrichment**：切片文本前缀 `"[doc_title]::[chapter]::[section] "`；参考 Anthropic Contextual Retrieval。可开关。

**Embed**：默认走 minibot providers 抽象（openai / bge / m3e / bge-m3 等）；embedding 模型和维度记录在 chunks 表的 partition，允许一个 KB 里多向量列共存（第二版）。

**去重**：`sha256(document)` 拒重复 upload；`content_hash(chunk_text)` 之间做 near-dup（第二版加 minhash）。

## 5. Retrieval

**基础三种**：

- `vector`：pgvector cosine top-k
- `keyword`：pg full-text 或 ES BM25
- `hybrid`：RRF（Reciprocal Rank Fusion）+ 可选加权

**Rerank**（可选层）：Cohere Rerank / BGE-Reranker / cross-encoder；缺省走 API，本地部署可换 sentence-transformers。

**Filter**（metadata）：`meta.page`, `meta.heading_path`, `meta.tags`, `meta.source_uri`, `created_at range`。

**接口**（简化）：

```
POST /v1/kb/{kb_id}/retrieve
body: {
  query: str,
  top_k: 8,
  mode: "vector" | "keyword" | "hybrid",
  filter: {...},
  rerank: { enabled: true, model: "bge-reranker-v2-m3", top_n: 5 },
  return: ["text","meta","score","doc_title"]
}
resp: { hits: [ {chunk_id, doc_id, score, text, meta} ] }
```

**Playground**：并排显示三种模式命中结果、rerank 前后对比、命中片段回原文高亮、分数分布图。

## 6. QA (RAG)

**流程**：

```
retrieve → rerank → context 组装 → prompt 模板渲染 → LLM 调用 → 引用抽取 → 返回
```

**Prompt 模板可配**（每 KB 保存一份 default，playground 可临时改）：

```jinja
你是 {{kb.name}} 的智能助手，只基于下面片段回答。
若片段不足以回答，请说"不知道"。

【片段】
{% for h in hits %}
[{{loop.index}}] 来源：{{h.doc_title}} · {{h.meta.heading_path}}
{{h.text}}
{% endfor %}

【问题】{{query}}
【要求】引用格式 `[片段编号]`，末尾列出用到的片段编号。
```

**引用**：把返回文本里的 `[i]` 映射回 hits[i-1]，输出 `citations: [{chunk_id, doc_id, uri, span}]`。

**Playground 参数**：top_k、mode、rerank、model（走 minibot providers）、prompt 模板、system prompt、temperature、max_tokens、是否 stream。

## 7. Connectors

**通用协议**：

```python
class Connector(Protocol):
    kind: str
    def config_schema() -> JsonSchema
    async def preview(config) -> list[DocumentPreview]
    async def sync(config, state) -> AsyncIterator[SourceRecord]  # 增量
    async def probe() -> HealthReport
```

**第一版 connector**：`upload`, `url`, `feishu`, `git`, `sql`。  
**代码沙箱**：`git` connector 的封装形态，配置 `{repo_url, branch, path_globs, language_hints}`；chunker 强制 `code_aware`。  
**飞书**：使用 OAuth2 + tenant_access_token；支持 space / wiki / docx；增量抓 `modified_time`。

## 8. 权限与多租户

- **Org → Members → API Keys**：默认单 org，能扩展到多。
- **KB 可见性**：private / org / public；每 KB 有自己的成员表。
- **API Key scopes**：`kb:read`, `kb:write`, `kb:admin`, `retrieve`, `qa`, `ingest`；细粒度到 KB。
- **审计**：每次写操作 append `audit_events` 表（第二版）。

## 9. 观测

- OpenTelemetry traces：`retrieve.vector`, `retrieve.rerank`, `qa.generate` 各 span
- Prometheus metrics：ingest_jobs_lag、embedding_qps、retrieval_latency_p95
- mini-langfuse（复用 minibot 现有集成）：QA 会话按 KB tag
- 结构化日志：`request_id`, `kb_id`, `actor`, `elapsed_ms`

## 10. UI 骨架（自带前端）

同一 FastAPI 挂静态页 + 少量 JS（跟 minibot Dev UI 风格一致）；后期迁 Next.js。

- `/ui/kb/` — 知识库列表 + 新建
- `/ui/kb/{id}/documents` — 文档列表 + 上传 + 状态
- `/ui/kb/{id}/chunks` — 切片浏览 / 编辑 / 手工 embedding refresh
- `/ui/kb/{id}/retrieval` — 检索 playground
- `/ui/kb/{id}/qa` — QA playground
- `/ui/kb/{id}/settings` — chunk 策略、embedding 模型、prompt 模板、成员
- `/ui/kb/{id}/eval` — 数据集与运行
- `/ui/api-keys` — API Key 管理

## 11. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 语言/框架 | Python 3.12 + FastAPI | 与 minibot 一致 |
| ORM | SQLAlchemy 2 + Alembic | 主流稳妥 |
| DB | Postgres 16 + pgvector | 单体够用，vector 支持 |
| 全文检索 | pg full-text（默认） / Elasticsearch（可选） | 起步不引入 ES |
| 对象存储 | MinIO / S3 | 本地 dev 用 MinIO |
| 任务队列 | RQ + Redis | Celery 太重；RQ 够 |
| Embedding | provider 抽象（openai / bge / m3e / bge-m3） | 复用 minibot providers（P0-6 完成后） |
| Rerank | Cohere API 或本地 bge-reranker-v2-m3 | 二者可选 |
| Parser | unstructured + 手工特化 | 覆盖多格式 |
| Front | 内嵌静态页（HTML+lit-html） | 与 minibot 一致 |
| 部署 | Docker Compose（本地）→ K8s Helm（后期） | 分阶段 |

## 12. 目录布局

```
minibot-monorepo/
  minibot/                   # 现有
  minikb/                    # 新增
    pyproject.toml
    README.md
    src/minikb/
      __init__.py
      main.py                # uvicorn 入口
      config/
        settings.py
      api/
        deps.py
        routes/
          knowledge_bases.py
          documents.py
          chunks.py
          data_sources.py
          retrieval.py
          qa.py
          eval.py
          members.py
          api_keys.py
          ingest.py           # 任务状态
      auth/
        api_key.py
        jwt.py
        rbac.py
      db/
        base.py
        models.py
        session.py
        migrations/           # alembic
      ingest/
        pipeline.py
        parsers/
          pdf.py
          docx.py
          markdown.py
          html.py
          xlsx.py
          pptx.py
          code.py
          notebook.py
        cleaners/
        chunkers/
          recursive.py
          by_heading.py
          semantic.py
          code_aware.py
          table_aware.py
          sliding_window.py
        enrichers/
        workers.py            # RQ workers
      embedding/
        provider_bridge.py    # 走 minibot providers HTTP
        registry.py
      index/
        pgvector.py
        elastic.py            # 可选
      retrieval/
        vector.py
        keyword.py
        hybrid.py
        rerank/
          cohere.py
          bge_local.py
      qa/
        rag.py
        prompts/
      connectors/
        base.py
        upload.py
        url.py
        feishu.py
        git.py
        sql.py
      observability/
      ui/                     # 静态 HTML + JS
        index.html
        kb/
    tests/
    docker/
      docker-compose.yml
      Dockerfile
    scripts/
      dev.sh
```

## 13. 与 minibot 的关系

- **minibot 不嵌入 minikb 逻辑**；只经 HTTP 消费。
- 在 minibot 侧新增一个薄集成层（独立小 phase，详见 `p3-kb-integration-design.md`）：
  - `KbClient`（httpx）
  - 内置工具 `kb_list / kb_search / kb_answer`（走审批策略）
  - Dev UI 页面 `/ui/knowledge.html`：列表 + 搜索测试
  - 可作为 P2-13 Plugin 打包（`plugin.yaml` 里声明 mcp/tools/user_config）

## 14. 里程碑（KB-M0..M8）

- **KB-M0 Skeleton**：单体 FastAPI + pg + MinIO + Redis；KB CRUD + upload；简单 recursive chunker + pgvector；能跑起 e2e
- **KB-M1 摄入完备**：多解析器、多 chunker、workers + 进度事件、失败重试、去重
- **KB-M2 检索完备**：vector/keyword/hybrid + rerank + filter + retrieval playground
- **KB-M3 QA playground**：prompt 模板 + 引用 + 模型可选 + stream + qa_logs
- **KB-M4 数据源扩展**：URL / Feishu / Git（含代码沙箱形态）+ 增量同步
- **KB-M5 权限**：多 org / KB 成员 / API Key scopes
- **KB-M6 评估**：QA dataset + Recall@k / MRR / faithfulness / answer relevance
- **KB-M7 UI 完善 & minibot 集成**：`p3-kb-integration`（客户端 + 工具 + Dev UI 页面）
- **KB-M8 运维**：docker-compose、监控、备份/恢复、导入导出

## 15. 非目标（明确不做）

- 不做实时协作编辑（文档编辑不是 KB 的职责）
- 不做完整 IM
- 不做端到端 encryption；只做常规 secret 存储
- 不做本地部署一键私有化（第一版）
