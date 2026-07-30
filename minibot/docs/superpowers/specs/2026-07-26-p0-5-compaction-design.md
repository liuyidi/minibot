# P0-5 · Compaction 升级 (Design)

> 对齐 `chengxiaobang/apps/backend/src/agent/compaction.ts` + `micro-compact.ts` + `context-usage.ts` + `docs/context-compaction.md`

## 1. 目标

从"按消息条数触发"升级到：

- **主 compact**：按 token 达阈值触发（默认 provider window 的 70%），把早期对话总结成一条 system message，保留最近 N 轮 + 未闭合 tool_call。
- **micro-compact**：单条 tool 结果过大（默认 40 KiB）时，只压这一条，不动其他消息。
- **保留结构**：tool_call 与 tool_result 必须成对；不允许把 tool_call 压掉、tool_result 保留。

## 2. Token 估算

`agent/context_usage.py`（对齐 chengxiaobang）：

- 优先用 provider 提供的 tokenizer（openai 用 `tiktoken`；anthropic 用 `anthropic.count_tokens`）
- 未接入的走 `chars/4` fallback（当前 `context_estimate.py` 保留为兜底）
- 返回：`{messages, system, tools_schema, total, window, threshold}`

## 3. 主 compact 流程

```
if usage.total > usage.threshold:
    keep_recent = last K messages（K=`compact_keep_recent`）
    to_summarize = messages[:-K]  # 但不能截断 tool_call/tool_result 对
    summary = await summarize(to_summarize, provider=fast_model)
    new_history = [
      MessageRecord(role='system', content_text='<compact_summary>...</compact_summary>', payload_json={...}),
      *keep_recent
    ]
    persist new_history
    emit session_updated { compact: True }
```

- 保护线：`compact_min_interval_sec = 30`（同一 session 30s 内只压一次）
- 保护线：连续两次 compact 后 total 未下降 30% → 降级只做 micro-compact，避免死循环

## 4. Micro-compact

- 触发时点：`_serialize_tool_result` 时若长度 > `micro_compact_bytes`
- 用 fast_model 做"用 400 字总结这段工具输出，保留关键字段和错误"
- 原始 result 存 `tool_calls.result_json` 全量；messages 表里只放 summary + `[original_len=xx bytes, sha256=xx]` 提示
- 支持 opt-out：某些工具（`file_read` 大文件已经在工具层截断了）直接跳过

## 5. Summary prompt

固定模板 + 少量 few-shot：

```
你是对话压缩助手。请把以下对话总结成不超过 800 字的 markdown，
保留：用户目标、已完成动作、关键结论、未闭合的问题；
删除：工具输入输出细节、样板闲聊。
输出直接是总结，不要额外解释。
```

## 6. 与 goal / subagent 协同

- Goal 续跑前会 rebuild history；rebuild 时优先取 compact summary
- Subagent 内部独立 context，不受父 compact 影响
- Compact 事件写 `session_updated` + `events` 表，便于回放

## 7. 配置

`AppConfig` 增加：

```python
compact_token_threshold_ratio: float = 0.7
compact_keep_recent: int = 16        # 已有
micro_compact_bytes: int = 40_000
fast_model: str | None = None        # None → active_preset 同 model
compact_min_interval_sec: int = 30
```

## 8. 观测

- 每次 compact 日志：`session_id, before_tokens, after_tokens, kept_msgs, elapsed_ms`
- `GET /api/dev/context/{session_id}` 返回当前 token usage 结构

## 9. 错误路径

- fast_model 失败：跳过本次压缩，返回原 history + `warn` 事件
- Provider tokenizer 缺失：退回 chars/4；日志 warn 一次

## 10. 测试要点

- 假造超长对话触发 compact，验证 tool_call 对不断
- micro-compact 命中 → 消息表里是 summary，`result_json` 仍完整
- fast_model 失败链路：不崩、日志有 warn
- 30s 内连打两次不重复压缩
