# P0-2 · File-change 追踪 + Revert (Design)

> 对齐 `chengxiaobang/apps/backend/src/tools/file-change.ts` + `file-change-revert.ts`

## 1. 目标

每次 fs 写/编辑工具（`write_file`, `edit_file`, `apply_patch`）都记录 before/after，允许按 tool_call_id 撤销；对齐"外科手术式修改"原则。

## 2. 数据模型

```python
class FileChange(BaseModel):
    id: str                # uuid
    tool_call_id: str
    session_id: str
    run_id: str
    path: str              # workspace-absolute normalized
    op: Literal["create", "modify", "delete"]
    before_sha256: str | None
    after_sha256: str | None
    before_bytes_ref: str | None  # 落盘路径
    after_bytes_ref: str | None
    size_before: int | None
    size_after: int | None
    created_at: str
    reverted_at: str | None
```

- 内容存 `~/.minibot/data/file_changes/<yyyy-mm-dd>/<id>.bin`（未压缩，简单）
- 大文件（>2 MiB）不保存 after，只保 sha256 + size + 首/末 4 KiB 快照，revert 时按 sha256 验证再回写 before
- delete 场景保 before 内容，after=None

## 3. Hook 层

`agent/tools/file_state.py`（对齐 nanobot 命名）：

- `capture_before(path) -> BeforeSnapshot`
- `record_after(path, before, tool_call_id, run_id, session_id) -> FileChange`
- 调用点：`filesystem.py` 的 write/edit/delete
- 幂等：同一 tool_call_id 内多次写同一文件只保第一个 before 与最后一个 after

## 4. Revert

`agent/tools/file_revert.py`：

```python
def revert(change_id: str) -> RevertResult
def revert_by_tool_call(tool_call_id: str) -> list[RevertResult]
def revert_last_run(run_id: str) -> list[RevertResult]
```

- 前置检查：当前磁盘 sha256 必须等于 after_sha256（未被外部改动）
- 冲突时返回 `RevertResult.conflict`，不动文件，让用户决策

## 5. 工具与 API

内置工具（对齐 chengxiaobang 的 `Undo` 语义）：

```
tool file_history(path?: str, limit=20) -> list[FileChange]
tool file_revert(change_id | tool_call_id) -> RevertResult
```

REST：

- `GET /api/file-changes?session_id=&run_id=&path=`
- `POST /api/file-changes/{id}/revert`
- `POST /api/file-changes/revert-tool-call/{tool_call_id}`

## 6. 存储管理

- 每次启动清理 `reverted_at` 超过 7 天或 orphan（tool_call_id 不存在）的记录 + 内容文件
- 单次 workspace 总 quota：默认 200 MiB，超过按 LRU 驱逐（保留 sha256 但删内容 → 变成"只能查看历史，不能撤销"）

## 7. 与审批联动

- Revert 属于 mutating 动作，也走 P0-1 审批（默认 require_human，除非同一 run 内自动 revert 失败工具）
- Agent 主动 revert 前建议先给用户看 diff（工具返回 diff preview）

## 8. 错误路径

- before/after 内容缺失（quota 驱逐）→ `revert` 返回 `unrevertable`
- 目标目录被删 → 尝试重建，失败则报 `parent_missing`
- 权限错误 → 直接冒泡

## 9. 测试要点

- write → revert 回原文件
- create → revert 变 delete
- delete → revert 重建文件
- 外部修改后 revert 冲突
- quota 驱逐后 revert 失败
