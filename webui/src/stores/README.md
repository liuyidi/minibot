# WebUI Zustand stores

Zustand here is **UI / shell chrome only**.

## Allowed

- Sidebar open / preview / mobile drawer
- Dialog pending state (delete / rename)
- Restart toast / restarting flag
- Session search panel open
- Running / updated chat **badges** (ephemeral UI markers, not the session list)

## Not allowed

- Caching settings, sessions, skills, automations, channels, or other server payloads
- Treating stores as a global API response bucket

Server data belongs in `src/hooks/` (+ `src/lib/apis/`). See `.cursor/rules/webui-async-rules.mdc`.
