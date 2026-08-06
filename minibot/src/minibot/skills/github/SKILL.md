---
name: github
description: Interact with GitHub using the `gh` CLI (issues, PRs, runs, api).
requires:
  bins:
    - gh
---

# GitHub

Use `exec` with the `gh` CLI. Prefer `--repo owner/repo` when not inside a git checkout.

## Common

```bash
gh pr checks <n> --repo owner/repo
gh run list --repo owner/repo --limit 10
gh run view <run-id> --repo owner/repo --log-failed
gh api repos/owner/repo/pulls/55 --jq '.title, .state'
```

If `gh` is missing, tell the user to install GitHub CLI.
