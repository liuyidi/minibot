# minibot 部署（阿里云 ECS）

本目录是 **minibot server + WebUI 挂载 + `liuyidi.me` 公开站** 的部署入口。  
mini-langfuse 在腾讯云（`https://mlf.liuyidi.me`）；minikb 在火山引擎直连 TLS（`https://kb.liuyidi.me`），本机 nginx **不要**再反代 kb。

| 域名 | 本机角色 | 发布 |
|------|----------|------|
| https://liuyidi.me | VitePress SSG（`site/` → `site/.vitepress/dist`） | `Publish Site (ECS)` |
| https://bot.liuyidi.me | minibot `:8766` + 挂载 `deploy/webui-dist` | Server / WebUI 分开 |

ECS：`root@116.62.35.76`，代码 `/opt/demo/minibot/`。  
`/opt/demo/mini-langfuse/` 只在 **构建镜像** 时提供 `sdk-python`（`LANGFUSE_SDK_DIR`），不要在阿里云再起 mlf。

## 现有资产

- `docker-compose.yml` / `up.sh` / `.env.example` — Python 瘦镜像；WebUI bind-mount `./webui-dist`
- `promote-site.sh` / `promote-webui.sh` — CI 上传后原子替换静态产物
- `build-site.sh` — 可选：ECS 本机构建 site（生产优先 CI 构建）
- `nginx.liuyidi.me.conf.example` — apex + bot（不含 kb / mlf）
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
