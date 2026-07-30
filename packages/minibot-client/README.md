# @minibot/client

Shared **minibot Client API** for WebUI, React Native, Desktop, and scripts.

Contract: [`docs/client-api.md`](../../docs/client-api.md) (L0 bootstrap · L1 REST · L2 WS).

npm name: **`@minibot/client`** · registry: **GitHub Packages（私有）**

## Install

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
cd /path/to/minibot-react-native && npm install
```

### Production / EAS（GitHub Packages）

1. 创建 GitHub Organization **`minibot`**（scope 必须与包名前缀一致）：https://github.com/organizations/plan  
2. 在 org 下发 PAT（classic）勾选 `read:packages` / `write:packages`（发布用）；或把本仓库转到 org `minibot` 后用 `GITHUB_TOKEN`。  
3. 消费方根目录 `.npmrc`：

```ini
@minibot:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

4. 依赖：

```json
{
  "dependencies": {
    "@minibot/client": "0.1.0"
  }
}
```

```bash
export NODE_AUTH_TOKEN=ghp_xxx   # 有 read:packages 的 PAT
npm install @minibot/client
```

发布（维护者）：

```bash
# 方式 A：打 tag 触发 Actions
git tag client-v0.1.0 && git push origin client-v0.1.0

# 方式 B：Actions → Publish @minibot/client → Run workflow
# 若仓库在用户 liuyidi 下，请在 repo Secrets 配置 PKG_TOKEN（org minibot 的 write:packages PAT）
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
