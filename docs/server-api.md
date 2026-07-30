# minibot API contract

Base URL (dev): `http://127.0.0.1:8766`

Auth: `Authorization: Bearer <token>` from bootstrap. Local default does not require a gateway secret.

## Bootstrap

`GET /auth/bootstrap` or `GET /webui/bootstrap`

Optional header: `X-Nanobot-Auth` or `X-Minibot-Auth` (`<MINIBOT_SERVER_AUTH_SECRET>`)

```json
{
  "token": "...",
  "ws_path": "/ws",
  "expires_in": 86400,
  "model_name": "gpt-4o-mini",
  "runtime_surface": "minibot"
}
```

## REST

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/health` | — | Liveness |
| GET | `/api/sessions` | — | List sessions |
| POST | `/api/sessions` | `{ "title"?: string }` | Create |
| GET | `/api/sessions/{id}/messages` | — | Raw LLM messages |
| GET | `/api/sessions/{id}/webui-thread` | — | UI transcript |
| DELETE | `/api/sessions/{id}` | — | Delete (`GET .../delete` also accepted) |
| POST | `/api/sessions/{id}/turns` | `{ "content": string }` | Sync agent turn |
| GET | `/api/settings` | — | Settings snapshot |
| PATCH | `/api/settings` | JSON fields | Update + persist |
| POST | `/api/settings/update` | same | Alias |

Session ids may be passed as bare ids or `websocket:<id>`.

## WebSocket `/ws?token=...`

### Client → server

| type | fields |
|------|--------|
| `new_chat` | — |
| `attach` | `chat_id` |
| `message` | `chat_id`, `content`, optional `media` |

### Server → client

| event | fields |
|-------|--------|
| `ready` | `chat_id`, `client_id` |
| `attached` | `chat_id` |
| `message` | `chat_id`, `text`, optional `kind` (`tool_hint`) |
| `turn_end` | `chat_id` |
| `goal_status` | `chat_id`, `status` (`running`\|`idle`) |
| `error` | `detail`, optional `chat_id` |

V1 sends full assistant text in one `message` event (no `delta` yet).
