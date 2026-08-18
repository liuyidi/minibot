---
title: 功能介绍
description: ServerlessShip 把 GitHub Release / 部署事件变成飞书消息卡片。Vercel + Supabase，给 minibot 等项目做交付通知。
---

# ServerlessShip 功能介绍

**ServerlessShip** 是轻量的发布通知服务：GitHub Release 或部署流水线结束时，把事件收成飞书应用消息卡片。跑在 Vercel Hobby，状态放在 Supabase Free，不养一台常驻通知后端。

公网：[serverless-ship.liuyidi.me](https://serverless-ship.liuyidi.me/)。

## 一、核心能力

- **收事件**：`POST /api/releases`、GitHub webhook（`/api/webhooks/github`）
- **发飞书**：应用身份发卡片；可选 webhook 兜底
- **记状态**：Supabase 存项目、release、投递记录，便于重试和对账
- **看板**：双语落地页 + dashboard（部署列表、项目模板）
- **健康检查**：`GET /api/health`

闭环可以看成：人 → GitHub → Actions → ServerlessShip → Supabase → 飞书卡片。

## 二、适用场景

- **发版通知**：minibot Desktop / 运行时发布后，飞书里直接看到版本和链接
- **工作流结束**：没有 git tag 的 workflow 也可以推一条
- **多仓库**：按 repository 识别项目，模板可绑到 GitHub App

## 三、和「自己刷 Actions」的差别

| 打开 GitHub Actions | ServerlessShip |
| --- | --- |
| 要人去翻 run | 飞书里推卡片 |
| 各仓库通知格式不统一 | 统一卡片 + 按项目模板 |
| 没有投递记录 | Supabase 记 release / delivery |
| 得养 bot 进程 | Vercel 函数，按次跑 |

## 四、建议阅读顺序

1. [打开小工具](https://serverless-ship.liuyidi.me/)
2. 本页功能介绍
3. [更新日志](/serverless-ship/changelog/)
4. 接入看 [GitHub README](https://github.com/liuyidi/serverless-ship/blob/main/README.md)
