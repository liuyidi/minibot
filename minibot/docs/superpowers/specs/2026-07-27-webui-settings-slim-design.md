# Design: WebUI 精简 Settings（P0）

> 日期：2026-07-27  
> 状态：已批准（方案 C）

## Goal

放出侧栏 Settings；导航只保留 **Overview / Appearance / Models / Runtime**。其它 Settings section 隐藏入口、保留实现代码。

## Non-goals

- 不放 Apps / Skills / Automations 侧栏
- 不实现 Image / Voice / Browser / Advanced / CLI Apps
- 不改 Models 里的 OAuth 多 provider 深水区（本波隐藏 Providers 面板）

## UI gates

- `UI_ENTRY.settings = true`
- `SETTINGS_SECTIONS = ["overview","appearance","models","runtime"]`
- `SETTINGS_SHOW_PROVIDERS_PANEL = false`

隐藏 section 的 deep link → 落到 `overview`。

## Overview

保留：Current model、Gateway/Engine、Workspace、About/version。  
去掉：Usage 热图、Web / Image / Voice 能力行。

## minibot payload

`GET /api/settings` 补齐 Overview/Runtime 所需字段：`runtime`、`usage`（空）、`version`；`image_generation` / `transcription` 保持 stub（enabled: false + 空 providers），前端不崩即可。

## 验收

1. 侧栏出现 Settings
2. Settings 导航只有 4 项
3. 改 model/preset、bot_name、timezone 可保存
4. webui + minibot 相关测试绿
