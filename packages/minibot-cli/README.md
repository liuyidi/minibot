# @liuyidi/minibot

`minibot` CLI for device-flow login and a remote Gateway client (`status`, `sessions`, `chat`).

By default:

- Auth (login): `https://auth.liuyidi.me`
- Gateway (chat/sessions/status): `https://bot.liuyidi.me`

## Install

Requires Node.js ≥ 18.

```bash
npm i -g @liuyidi/minibot
minibot login
minibot chat
```

## Auth

```bash
minibot login
minibot whoami
minibot logout
```

## Gateway (cloud default)

```bash
minibot status
minibot sessions list
minibot chat -m "hello"
minibot chat                 # interactive REPL
```

### Local gateway (advanced)

Start the Python Gateway separately, then point the CLI at it:

```bash
# terminal 1
cd minibot && uv run minibot

# terminal 2
MINIBOT_API_URL=http://127.0.0.1:8766 minibot status
# or: minibot status --base-url http://127.0.0.1:8766
```

### Credential precedence

1. `--secret` / `MINIBOT_AUTH_SECRET` → `X-Minibot-Auth`
2. `minibot login` session → `Authorization: Bearer` (Gateway must have `auth_provider=mini_auth`)
3. Anonymous — only when the Gateway allows open bootstrap

```bash
minibot login && minibot chat -m "hi"    # product path (cloud)
export MINIBOT_AUTH_SECRET=your-secret   # local/CI bypass when needed
```

### Env

| Variable | Meaning |
| --- | --- |
| `MINIBOT_AUTH_URL` | mini-auth base (login) |
| `MINIBOT_API_URL` | Gateway base (default `https://bot.liuyidi.me`) |
| `MINIBOT_AUTH_SECRET` | Optional `X-Minibot-Auth` bypass |
| `MINIBOT_CONFIG_DIR` | Config dir (default `~/.minibot`) |
