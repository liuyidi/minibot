# Phase 8.1 — media / file-preview

> **上游：** [`../migration.md`](../migration.md) Phase 8.1  
> **分支：** `phase-8.1-media-file-preview`  
> **状态：** ✅ 后端完成（2026-08-05）；`tests/test_media_phase81.py` 绿

## 目标

补齐 WebUI 图片附件与工作区文件预览的后端：

1. `GET /api/media/{sig}/{payload}` — HMAC 签名媒体字节
2. WS `message.media[]`（data_url）→ 落盘 `~/.minibot/media/websocket/` → 会话 JSONL `media: [paths]`
3. `GET /api/sessions/{id}/file-preview?path=` — 工作区内文本预览
4. `webui-thread` 回放用户附件为签名 URL（缩略图刷新后仍在）
5. 有图时 user content 走多模态 `image_url`（若 provider 支持）

## 落地要点

| 组件 | 路径 |
|------|------|
| decode | `minibot/utils/media_decode.py` |
| ingress | `minibot/webui/{ingress_policy,attachment_ingress}.py` |
| sign/serve | `minibot/webui/media_api.py` + `api/routes/media.py` |
| gateway | `minibot/webui/media_gateway.py`（`AppState.media_gateway`） |
| preview | `minibot/webui/file_preview.py` + sessions `file-preview` |
| loop | `persist_user_message` / `build_user_content`；WS/REST `media=` |
| thread | `webui-thread` → signed `media` / `images` |

`/api/sessions/{id}/messages` 返回签名 `media_urls` 时会浅拷贝 message dict，避免污染 session store。

## 明确不做（本切片）

- 8.4 语音转写 / Composer 麦克风
- 8.7 `/model`
- 完整 transcript 分页 / activity 回放对等 nanobot
- FilePreviewAvailability probe（可选 follow-up）
- 助手出站 `media_urls`（可后补）

## 正常 UI / 异常 UI

| | |
|--|--|
| **正常** | Composer 附加 PNG → 发送 → 气泡缩略图；刷新后仍加载 `/api/media/...`；点 markdown 文件引用 → 侧栏预览 |
| **异常** | 签名错误 → 401；路径逃逸 workspace → 403；二进制预览 → 415；超大附件 → `attachment_rejected` |

## 验收

```bash
cd minibot && uv run pytest tests/test_media_phase81.py -q
```

手动：WebUI 附一张图发一轮 → 刷新仍见缩略图 → 打开工作区内 `.py` 预览。
