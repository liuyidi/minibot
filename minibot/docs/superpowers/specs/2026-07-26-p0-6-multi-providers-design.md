# P0-6 · Provider 多后端 (Design)

> 对齐 `chengxiaobang/apps/backend/src/model/*` + nanobot `providers/*`

## 1. 目标

在保留 OpenAI-compat preset 的基础上，新增 **Anthropic**、**Azure OpenAI**、**Bedrock** 三个 provider；抽象成 factory + registry；工具调用/流式/取消/token 计数各 provider 独立实现，Runner 与工具层无感知。

## 2. Provider 抽象

`providers/base.py`（升级现有接口）：

```python
class LLMProvider(Protocol):
    id: str                                # e.g. "anthropic"
    caps: ProviderCaps                     # 支持哪些能力
    async def stream(request: LLMRequest) -> AsyncIterator[LLMEvent]
    async def count_tokens(messages) -> int
    async def close() -> None

@dataclass
class ProviderCaps:
    streaming: bool
    tool_use: bool
    parallel_tools: bool
    thinking_channel: bool
    image_input: bool
    context_window: int
```

`LLMEvent` 通用类型：`text_delta` / `thinking_delta` / `tool_call_start` / `tool_call_arg_delta` / `tool_call_end` / `finish` / `error`。

## 3. 三个新 provider

### Anthropic

- 依赖：`anthropic` SDK
- 工具用 Anthropic 原生 tool_use 消息（system prompt / tool schema 翻译由 provider 完成）
- 支持 `thinking` 通道 → 映射 `LLMEvent.thinking_delta`
- Tokenizer：SDK 自带

### Azure OpenAI

- 依赖复用 `openai` SDK 但换 base_url + `api_version`
- 主要工作是 preset 结构里加 `api_version`, `deployment` 字段
- 大部分逻辑与现有 openai-compat 相同，独立子类主要为了 caps / 校验

### Bedrock

- 依赖：`boto3` + `bedrock-runtime`
- Model id 例：`anthropic.claude-3-sonnet-20240229`
- 流式：`converse_stream`；工具：Bedrock converse tools schema
- 认证：AWS 标准 chain（env / profile / role）

## 4. Registry + Factory

`providers/registry.py`：

```python
def register(provider_id, factory)   # factory(preset) -> LLMProvider
def build(preset) -> LLMProvider
def caps(provider_id) -> ProviderCaps
```

`config/presets.py` 扩展 `ModelPreset`：

```python
class ModelPreset(BaseModel):
    id: str
    label: str
    provider: Literal["openai_compat","anthropic","azure_openai","bedrock"] = "openai_compat"
    model: str
    api_key: str = ""
    api_base: str = ""
    api_version: str | None = None    # azure
    deployment: str | None = None     # azure
    region: str | None = None         # bedrock
    temperature: float | None = None
    extra_headers: dict[str, str] = {}
```

## 5. Runner 集成

- Runner 只调用 provider 抽象；不再见到 openai-specific 名称
- `smart_approval` / `session_title` / `compact` / `micro_compact` 也从 `state.provider_for(kind)` 拿实例（kind 可以是 "main" / "fast" / "smart"，AppConfig 里映射到 preset id）
- 图像输入按 caps 决定是否走 vision 分支（MVP 只做占位，具体实现放 P2）

## 6. Fallback / 多 preset

- 若 preset 内配置 `fallback_ids: [id2, id3]`，主 preset 失败时按顺序降级
- 每次 fallback 打日志 + 事件 `session_updated{provider_fallback:{...}}`

## 7. 配置与迁移

- 现有 `openai_api_key` / `openai_base_url` 顶层字段保留一 phase，新代码从 preset 里读
- 迁移：启动时把顶层字段合并到 `default` preset

## 8. 观测

- 每次 stream 关闭前打 usage（tokens_in/out/thinking），落 `runs.usage_json`
- 每个 provider 有 `caps()` 展示端点：`GET /api/dev/providers`

## 9. 测试要点

- 每 provider 有 fixture 假 SDK（monkeypatch）
- Runner 合约层测试：脚本 provider → 事件序列
- Fallback：主失败 → 次成功；两个都失败 → run failed
