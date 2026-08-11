# @liuyidi/minibot-client

[![Publish @liuyidi/minibot-client](https://github.com/liuyidi/minibot/actions/workflows/publish-client.yml/badge.svg)](https://github.com/liuyidi/minibot/actions/workflows/publish-client.yml)

Shared **minibot Client API** for WebUI, React Native, Desktop, and scripts.

Contract: [`docs/client-api.md`](../../docs/client-api.md) (L0 bootstrap · L1 REST · L2 WS).

| | |
|--|--|
| **Published name** | `@liuyidi/minibot-client`（GitHub Packages，scope=仓库主人） |
| **Import alias** | `@minibot/client`（业务代码统一用这个） |

## Install

### Dev（sibling monorepo）

依赖左边写 alias，右边指本地目录（代码仍 `from "@minibot/client"`）：

```json
{
  "dependencies": {
    "@minibot/client": "file:../minibot/packages/minibot-client"
  }
}
```

```bash
cd packages/minibot-client && npm install && npm run build
cd /path/to/minibot-react-native && npm install
```

### Production / EAS（GitHub Packages + alias）

消费方根目录 `.npmrc`（scope 跟**发布名**走）：

```ini
@liuyidi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

依赖用 npm alias，保住 `@minibot/client` import：

```json
{
  "dependencies": {
    "@minibot/client": "npm:@liuyidi/minibot-client@0.1.0"
  }
}
```

```bash
export NODE_AUTH_TOKEN=ghp_xxx   # read:packages PAT（或登录过的 gh）
npm install
```

发布（维护者，仓库 `liuyidi/minibot` 即可，`GITHUB_TOKEN`）：

```bash
git tag client-v0.1.0 && git push origin client-v0.1.0
# 或 Actions → Publish @liuyidi/minibot-client → Run workflow
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
