# WebUI shared components

Business UI used by the app shell or ≥2 pages. Prefer domain folders:

```text
components/
├── ui/            # shadcn / Radix primitives only
├── sidebar/       # sidebar, session lists, chrome dialogs
├── thread/        # chat surface (shell / composer / messages / activity / …)
├── markdown/      # MarkdownText / CodeBlock renderer pipeline
├── settings/      # settings-domain shared chrome (+ LanguageSwitcher)
└── capabilities/  # experts / skills / connectors hub (tabs + shared catalog chrome)
```

`thread/` layout:

```text
thread/
├── ThreadShell.tsx           # orchestrator entry
├── useThreadMessageCache.ts  # history hydrate / in-memory cache
├── shell/                    # header, prompt nav, workspace controls
├── composer/                 # input, mentions, model badge, palettes
├── messages/                 # bubbles, attachments, approvals, feedback
├── activity/                 # tool/activity timeline cluster
├── preview/                  # file preview panel + resize controller
└── viewport/                 # scroll viewport
```

Import from the domain path, e.g. `@/components/sidebar/Sidebar`, `@/components/thread/composer/ThreadComposer`.
Page-only widgets stay under `pages/<page>/`.
