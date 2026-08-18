# minibot 部署（阿里云 ECS）

本目录是 **minibot + WebUI + `liuyidi.me` 公开站** 的唯一部署入口。  
mini-langfuse 在腾讯云（`https://mlf.liuyidi.me`）；minikb 在 Volcengine（本机 nginx 只反代 `kb.liuyidi.me`）。

| 域名 | 本机角色 |
|------|----------|
| https://liuyidi.me | VitePress SSG（`site/` → `site/.vitepress/dist`） |
| https://bot.liuyidi.me | minibot `:8766` |
| https://kb.liuyidi.me | nginx → Volcengine `101.96.224.232:80` |
| https://mlf.liuyidi.me | **不在本机**（腾讯云） |

ECS：`root@116.62.35.76`，代码 `/opt/demo/minibot/`。  
`/opt/demo/mini-langfuse/` 只在 **构建镜像** 时提供 `sdk-python`（`LANGFUSE_SDK_DIR`），不要在阿里云再起 mlf。

## 现有资产

- `docker-compose.yml` / `up.sh` / `.env.example`
- `build-site.sh` — ECS 上用 `node:22` 容器构建公开站（`../site/` → `../site/.vitepress/dist/`）
- `nginx.liuyidi.me.conf.example` — apex + bot + kb（不含 mlf）
- `setup-swap.sh` / `setup-docker-mirror.sh` — 2C2G 宿主机一次性脚本

## 生产认证

```bash
MINIBOT_SERVER_AUTH_PROVIDER=mini_auth
MINIBOT_SERVER_MINI_AUTH_BASE_URL=https://auth.liuyidi.me
MINIBOT_SERVER_MINI_AUTH_CLIENT_ID=minibot
MINIBOT_SERVER_MINI_AUTH_SCOPE=openid profile email
MINIBOT_SERVER_MINI_AUTH_CALLBACK_PATH=/auth/mini-auth/callback
MINIBOT_SERVER_REQUIRE_AUTH=true
```

可观测上报：`MINIBOT_SERVER_LANGFUSE_HOST=https://mlf.liuyidi.me`（密钥在项目 Settings）。

## 启动

```bash
cd /opt/demo/minibot/deploy
cp .env.example .env   # 首次：从旧 demo/.env 拷密钥，不要 bash source
./up.sh
curl -fsS http://127.0.0.1:8766/health
```

不要 `source .env`：`MINI_AUTH_SCOPE` 含空格会把 shell 搞挂。始终 `--env-file .env`。

本地开发仍以仓库根目录 / `minibot/README.md` 为准。
