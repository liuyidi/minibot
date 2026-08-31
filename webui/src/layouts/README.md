# layouts/

Logged-in app chrome: sidebar, main pane, dialogs, and the hooks that drive them.

External code should import from `@/layouts` (`AppLayout`). Prefer not reaching into `chrome/` / `hooks/` from outside this folder.

```text
layouts/
├── index.ts                 # Public exports (`AppLayout`, `HostChrome`)
├── AppLayout.tsx            # Thin composer: theme, host bar, sidebar + main + dialogs
├── constants.ts             # Sidebar widths (browser 272 / native 240) and workspace-scope helpers
├── chrome/                  # Presentational layout UI
│   ├── HostChrome.tsx       # Native host title-bar / window chrome
│   ├── AppSidebarChrome.tsx # Desktop sidebar, preview overlay, mobile sheet, session search
│   ├── AppMain.tsx          # Main pane: ThreadShell + settings/utility overlays
│   └── AppDialogs.tsx       # Delete/rename dialogs and restart toast
└── hooks/                   # Layout state and side effects
    ├── useAppLayoutModel.ts     # Composes layout hooks and builds sidebar props
    ├── useHostSidebarUi.ts      # Host/mobile sidebar open, preview, width
    ├── useAppWorkspace.ts       # Settings snapshot, workspaces, draft/override scope
    ├── useAppSessionRuntime.ts  # Run indicators, attach, restart toast/status
    ├── useAppSessionNav.ts      # New/select/create/fork chat and workspace draft resets
    ├── useAppSidebarMutations.ts # Pin, rename, archive, group, delete confirmations
    ├── useAppUtilityNav.ts      # Settings/apps/skills/channels navigation + document title
    └── useAppChatActions.ts     # Bundles session nav + sidebar mutations for AppLayout
```

## 中文

登录后的应用壳：侧栏、主区、对话框，以及驱动它们的 hooks。

外部请从 `@/layouts` 引入（`AppLayout`）；尽量不要从目录外直接依赖 `chrome/` / `hooks/`。

```text
layouts/
├── index.ts                 # 对外导出（AppLayout、HostChrome）
├── AppLayout.tsx            # 薄组装层：主题、宿主栏、侧栏 + 主区 + 对话框
├── constants.ts             # 侧栏宽度与工作区 scope 辅助函数
├── chrome/                  # 布局展示层 UI
│   ├── HostChrome.tsx       # 原生宿主标题栏 / 窗口 chrome
│   ├── AppSidebarChrome.tsx # 桌面侧栏、预览浮层、移动端 Sheet、会话搜索
│   ├── AppMain.tsx          # 主区：ThreadShell + Settings/Download 覆盖层
│   └── AppDialogs.tsx       # 删除/重命名对话框与重启 toast
└── hooks/                   # 布局状态与副作用
    ├── useAppLayoutModel.ts     # 组合各 layout hooks，并拼出 sidebar props
    ├── useHostSidebarUi.ts      # 宿主/移动端侧栏开合、预览与宽度
    ├── useAppWorkspace.ts       # Settings 快照、工作区、草稿/覆盖 scope
    ├── useAppSessionRuntime.ts  # 运行指示、attach、重启 toast/状态
    ├── useAppSessionNav.ts      # 新建/选择/创建/fork 会话，以及草稿 scope 重置
    ├── useAppSidebarMutations.ts # 置顶、重命名、归档、分组、删除确认
    ├── useAppUtilityNav.ts      # Settings/Apps/Skills/Channels 导航与 document.title
    └── useAppChatActions.ts     # 把会话导航与侧栏变更捆给 AppLayout 用
```
