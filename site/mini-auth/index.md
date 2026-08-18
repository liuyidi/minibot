---
title: 功能介绍
description: mini-auth 是统一身份中心：注册、登录、GitHub、OIDC / JWT，供 minibot 等业务接入。公网 auth.liuyidi.me。
---

# mini-auth 功能介绍

**mini-auth** 是独立的统一身份认证服务。邮箱注册 / 登录、JWT 刷新 / 登出、GitHub OAuth，以及给 [minibot](/minibot/) Web / Desktop 用的 OIDC。

公网：[auth.liuyidi.me](https://auth.liuyidi.me/)（腾讯云 CVM + Docker Compose + Caddy）。

## 一、核心能力

- **账号**：邮箱注册、登录、登出；access + refresh JWT
- **GitHub**：可扩展的外部 OAuth；验证邮箱匹配时可自动绑定
- **OIDC**：Authorization Code + PKCE；Desktop 可用 `minibot://` 回调
- **选择账号**：自定义 scheme 授权时可走选账号页
- **用户信息**：`/api/v1/me`、OIDC userinfo（含已绑定身份）
- **管理**：注册 OIDC client（如 `client_id=minibot`）
- **前端**：生产登录 / 注册 SPA，登录后回到业务（默认 minibot）

## 二、适用场景

- **Agent 产品登录**：bot.liuyidi.me、本机 Desktop 都跳到同一套账号
- **以后其它服务复用**：minikb / mini-langfuse 也可以接同一 IdP，不必各写一套登录
- **自建**：本地 Postgres + uvicorn；生产见腾讯云部署文档

## 三、和「每个应用自己做登录」的差别

| 业务里手写登录 | mini-auth |
| --- | --- |
| 每个产品一份用户表 | 一套账号，多 client |
| 桌面端要再发明回调 | OIDC + PKCE，Desktop 走 `minibot://` |
| GitHub 登录耦合在业务里 | 独立 OAuth adapter，邮箱可自动关联 |
| 退出要清一堆域 | 认证中心登出；业务清自己的 session |

## 四、建议阅读顺序

1. [打开认证](https://auth.liuyidi.me/) — 一般会从 minibot 跳过来
2. 本页功能介绍
3. [更新日志](/mini-auth/changelog/)
4. 自建看 [GitHub README](https://github.com/liuyidi/mini-auth/blob/main/README.md)
