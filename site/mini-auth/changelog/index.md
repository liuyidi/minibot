---
title: 更新日志
description: mini-auth 面向用户的重要变更。
outline: deep
---

# 更新日志

记录 **mini-auth** 面向用户的重要变更。仓库里还没有独立 `CHANGELOG.md`，按公网登录能感知的节点整理；细节见 [GitHub](https://github.com/liuyidi/mini-auth)。

- [打开认证](https://auth.liuyidi.me/)
- [GitHub](https://github.com/liuyidi/mini-auth)

## [Unreleased]

- 短信 / 微信登录仍依赖资质，未开。

## 2026-08

### 新增

- 生产登录 / 注册 SPA；已登录访问认证页会回到 minibot。
- GitHub OAuth；验证邮箱一致时自动绑定已有账号。
- OIDC userinfo 带上已绑定身份。
- Desktop：允许 `minibot://auth/callback` 作为 redirect。
- 自定义 scheme 授权时的「选择账号」页。
- 腾讯云 CVM 自动发布（成功后经 ServerlessShip 发飞书）。

### 修复

- `GET /logout` 清掉 Secure cookie。
- Caddy 把 `/oauth/select-account` 交给 SPA。
- 当前用户接口对齐 `/api/v1/me`。
