# @liuyidi/minibot-client

[![Publish npm packages](https://github.com/liuyidi/minibot/actions/workflows/publish-npm-packages.yml/badge.svg)](https://github.com/liuyidi/minibot/actions/workflows/publish-npm-packages.yml)

Shared **minibot Client API** for WebUI, React Native, Desktop, and scripts.

Contract: [`docs/client-api.md`](../../docs/client-api.md) (L0 bootstrap · L1 REST · L2 WS).

| | |
|--|--|
| **Published name** | `@liuyidi/minibot-client`（public npm） |
| **Import alias** | `@minibot/client`（业务代码可用 npm alias） |

## Install

### Public npm

```bash
npm i @liuyidi/minibot-client
```

Optional alias so app code keeps `from "@minibot/client"`:

```json
{
  "dependencies": {
    "@minibot/client": "npm:@liuyidi/minibot-client@1.0.17"
  }
}
```

### Dev（sibling monorepo）

```json
{
  "dependencies": {
    "@minibot/client": "file:../minibot/packages/minibot-client"
  }
}
```

```bash
cd packages/minibot-client && npm install && npm run build
```

Publish（维护者，`v*` tag 或 Actions → Publish npm packages；需 `NPM_TOKEN`）：

```bash
# after Release creates v1.0.17
# workflow publishes client then @liuyidi/minibot
```

## Usage (React Native)

```ts
import { createClient } from "@minibot/client";

const client = createClient({
  baseUrl: "https://bot.liuyidi.me", // 生产
  // baseUrl: "http://127.0.0.1:8766", // 本地
  getSecret: () => process.env.EXPO_PUBLIC_MINIBOT_SECRET,
});

await client.health();
await client.bootstrap();
client.ws.connect();
```

## Surface (v0.1)

| API | Methods |
|-----|---------|
| L0 | `bootstrap()`, `health()`, `resolveWsUrl` |
| L1 | `sessions.list/create/getThread/delete/turn` |
| L2 | `ws.connect/close/newChat/attach/sendMessage/abort/onChat/onStatus/onError` |

## Gateway

App 连接 `https://bot.liuyidi.me`（bootstrap + REST + `wss://…/ws`）。本包只打进客户端，不部署到 ECS。
