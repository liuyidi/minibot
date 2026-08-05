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

## 待补充

- [ ] `docker-compose.yml`（仅 minibot + 必要依赖）
- [ ] `.env.example`
- [ ] Nginx 片段（`bot.liuyidi.me`）
- [ ] 从 demo 栈拆出的操作步骤

本地开发仍以仓库根目录 / `minibot/README.md` 为准。
