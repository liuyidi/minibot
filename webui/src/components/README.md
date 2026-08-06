# WebUI shared components

Business UI used by the app shell or ≥2 pages. Prefer domain folders:

```text
components/
├── ui/          # shadcn / Radix primitives only
├── sidebar/       # sidebar, session lists, chrome dialogs, language switcher
├── thread/      # chat surface (composer, bubbles, activity, file preview, …)
├── markdown/    # MarkdownText / CodeBlock renderer pipeline
└── settings/    # settings-domain shared chrome
```

Import from the domain path, e.g. `@/components/sidebar/Sidebar`, `@/components/markdown/CodeBlock`.
Page-only widgets stay under `pages/<page>/`.
