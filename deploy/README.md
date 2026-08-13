# minibot 部署

本目录用于 **minibot（含 WebUI）独立部署** 文档与 Compose 模板。

此前面试 Demo 把 minibot 和 mini-langfuse、minikb 挤在同一台 2C2G 上，配置在：

- [`mini-langfuse/deploy/demo/`](https://github.com/liuyidi/mini-langfuse/tree/main/deploy/demo)

后续约定：

| 应用 | 部署文档位置 |
|------|----------------|
| mini-langfuse | `mini-langfuse/deploy/`（生产）+ `docs/tencent-lighthouse-mlf-migrate.md`（迁腾讯云） |
| minibot | **本目录** `minibot/deploy/` |
| minikb | `minikb/deploy/` |

## 现状（过渡）

当前线上仍可能由 `mini-langfuse/deploy/demo/docker-compose.yml` 的 `minibot` 服务拉起（域名如 `https://bot.liuyidi.me`）。  
mlf 迁到腾讯云 4C4G 后，建议阿里云旧机 **只保留 minibot**（+ 可选 minikb），并逐步把 Compose / Nginx / 运维说明迁入本目录。

## 现有资产

- `docker-compose.yml`：minibot 独立服务
- `.env.example`：生产运行时配置草案
- `nginx.bot.liuyidi.me.conf.example`：`bot.liuyidi.me` 反向代理片段

### 生产认证接入

`minibot` 已支持共享认证服务 `mini-auth`。生产环境建议设置：

```bash
MINIBOT_SERVER_AUTH_PROVIDER=mini_auth
MINIBOT_SERVER_MINI_AUTH_BASE_URL=https://auth.liuyidi.me
MINIBOT_SERVER_MINI_AUTH_CLIENT_ID=minibot
MINIBOT_SERVER_MINI_AUTH_SCOPE=openid profile email
MINIBOT_SERVER_MINI_AUTH_CALLBACK_PATH=/auth/mini-auth/callback
MINIBOT_SERVER_REQUIRE_AUTH=true
```

部署后，`GET /auth/login?next=...` 会跳转到 `https://auth.liuyidi.me/oauth/authorize`，再由 `minibot` 的 `/auth/mini-auth/callback` 完成会话落地。

本地开发仍以仓库根目录 / `minibot/README.md` 为准。
