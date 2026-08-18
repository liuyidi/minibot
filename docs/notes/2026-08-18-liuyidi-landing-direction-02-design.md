# liuyidi.me 入口页对齐 Direction 02

日期：2026-08-18  
状态：已实现  
关联：[`docs/plans/2026-08-18-daily.md`](../../plans/2026-08-18-daily.md) 第 2 / 5 项

## 目标

把 `https://liuyidi.me` 入口页从暗色营销风，改成 **mini-design-system Direction 02**：白底、近黑字、大留白、黑主按钮；保留现有项目入口，不做成营销站。

## 非目标

- 不改 `/minibot/` 等产品简介 / Changelog 正文内容（它们已用 VitePress + mini tokens）。
- 不新增项目入口、暗色主题开关、新营销长文。
- 本轮不强制 ECS 现场部署；实现后按既有 `deploy/build-site.sh` / up 流程发布即可。

## 源码与部署

| 角色 | 路径 |
|------|------|
| 正式源 | `site/`：`PortalLayout.vue` + `portal.css` + `mini-brand.tokens.css` |
| 构建产物 | `site/.vitepress/dist`（nginx `root`，见 `deploy/nginx.liuyidi.me.conf.example`） |
| 切流前兜底 | `deploy/landing/` 镜像同一套 IA + 视觉 |
| 预览归档 | 升正后删除 `site/public/v0.1/` 与 `deploy/landing/v0.1/` |

实现顺序：**先改 site，再镜像 deploy/landing，再删 v0.1**。

## 信息架构（升 v0.1 + hero 主按钮）

1. **顶栏**：`liuyidi.me` 字标 + GitHub + 语言切换。去掉与入口区重复的产品 nav。
2. **Hero**：eyebrow + 大标题 + 一句 lede。
3. **Hero CTA**（保留）：
   - 主：黑按钮「打开 Agent」→ `https://bot.liuyidi.me/`
   - 次：浅灰 / 描边「看开发笔记 /ui」→ `https://bot.liuyidi.me/ui/`
4. **入口区**：五张整卡可点（文案沿用 v0.1 短描述）：
   - minibot → `bot.liuyidi.me`
   - mini-langfuse → `mlf.liuyidi.me`
   - minikb → `kb.liuyidi.me/ui/`
   - mini-auth → `auth.liuyidi.me`
   - ServerlessShip → `serverless-ship.liuyidi.me`
5. **次要链**：DevUI、GitHub。
6. **建议走查顺序**（短文）+ **「我能讲清楚的能力」**（`<details>`，默认折叠）。
7. **页脚**：备案号。

中英 i18n 保留（`localStorage` key `landing.locale`）。

## 视觉（Direction 02）

依据 `mini-design-system`：`tokens/mini-brand.tokens.css`、`rules/mini-brand-rules.md`、`skills/mini-brand/SKILL.md`。

- 画布：`--mini-color-canvas`；正文：`--mini-color-ink` / `ink-soft` / `muted`。
- 字体：`--mini-font-sans`（去掉 Instrument Serif、DM Sans 外链依赖）。
- 入口卡：`--mini-color-surface` + `--mini-color-border-soft`；hover 用 `surface-hover`；无彩色描边、无厚阴影。
- 主按钮：黑底白字、`--mini-radius-control`、约 48px 高。
- 次按钮：浅灰表面或 1px `border-soft`。
- **禁止**：渐变背景、grain、玻璃拟态、装饰 blob、彩色 accent 条、旋转卡。
- Focus：仅键盘 focus 使用 `--mini-color-focus`。

`site/.vitepress/theme/mini-brand.tokens.css` 已是 tokens 副本；portal 样式映射到这些变量，不要另起一套调色板。

## 验收

- [x] 本地 `site` 构建后首页为白底 Direction 02；无渐变 / grain / 玻璃卡。
- [x] 五个产品入口 + hero 主/次 CTA 均可点且 URL 正确。
- [x] 中英切换正常；能力列表默认折叠。
- [x] `deploy/landing/` 与 site 门户视觉一致（兜底可用）。
- [x] `v0.1` 预览目录已删除；文档 / daily 计划勾选更新。
- [x] `npm run docs:check`（或等价 site check）通过。

## 风险与注意

- 现网若仍短暂指向旧 `deploy/landing`，镜像更新可避免回退到暗色页。
- 产品简介侧栏 / Overview 不在本轮范围；若首页去掉产品 nav，简介入口依赖卡片外的次要链或用户已知 `/minibot/`——本设计不强制顶栏「简介」链（已定稿）。
