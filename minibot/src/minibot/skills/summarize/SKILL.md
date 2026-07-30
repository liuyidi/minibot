---
name: summarize
description: Summarize URLs, local files, or YouTube via the `summarize` CLI when available.
---

# Summarize

When the user asks to summarize a link/file/video and the `summarize` binary exists:

```bash
summarize "https://example.com"
summarize "/path/to/file.pdf"
summarize "https://youtu.be/..." --youtube auto
```

If `summarize` is not installed, fall back to `web_fetch` + your own summary, or say the CLI is missing.
