# WebUI hooks

Reusable React hooks, grouped by domain. Prefer:

```ts
import { useSessions } from "@/hooks/sessions";
import { useSettings } from "@/hooks/settings";
```

| Folder | Contents |
|--------|----------|
| `sessions/` | Session list, history, WS stream, pickers, session automations |
| `skills/` | Skills list + hub catalog / MCP connectors |
| `settings/` | Settings, usage poll, workspaces, provider model lists |
| `channels/` | Feishu / Weixin status & pairing |
| `automations/` | Cron / automation jobs CRUD |
| `ui/` | Theme, sidebar persistence, composer attachments / voice / clipboard |

Page-only hooks (sheet/dialog local fetch) live next to the page, e.g. `pages/skills/useSkillDetail.ts`.

See `.cursor/rules/webui-async-rules.mdc` for apis → hooks → pages layering.
