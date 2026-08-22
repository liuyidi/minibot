# Release Process

This document describes the current release flow for `minibot`.

## Quick summary

- Develop on a feature branch.
- Update code, version fields, and `CHANGELOG.md` / `CHANGELOG.zh.md` together.
- Open a pull request into `main`.
- After merge, trigger the manual `Release` workflow.
- The workflow creates a unified tag like `v1.0.1`.
- Tag-based workflows build releases, publish packages, sync OSS assets, and send Feishu notifications.

## Versioning rules

- Use one shared release version across WebUI, Desktop, backend, and shared packages.
- Keep `webui/package.json`, `desktop/package.json`, `minibot/pyproject.toml`, and the other versioned files aligned.
- Keep the current release notes in `CHANGELOG.md` and `CHANGELOG.zh.md`.
- Use `v<version>` tags for release orchestration, for example `v1.0.1`.
  Desktop GitHub Releases use `desktop-v<version>` so they do not collide
  with that orchestration tag.

## Day-to-day development flow

1. Create a branch and make your changes.
2. If the change affects user-facing behavior, update the versioned files and the changelog together.
3. Run tests locally.
4. Open a PR to `main`.
5. Let CI run `Release Preflight` and any other required checks.
6. Merge only after review and green checks.

## Release flow

1. Confirm `main` already contains the desired release commit.
2. Open GitHub Actions and run **Release** manually.
3. The workflow reads the version from `webui/package.json`.
4. It creates and pushes a tag like `v1.0.1`.
5. That tag triggers downstream release workflows:
   - `Publish Desktop`
   - `Publish @liuyidi/minibot-client`
6. Desktop release artifacts are mirrored to OSS by **Sync Desktop Release to OSS**.
7. Feishu notifications are sent after OSS sync.

## What each workflow does

### `Release`

- Manual entrypoint for a release.
- Creates the unified tag from the current version.
- Does not build artifacts itself.

### `Release Preflight`

- Runs on PRs and pushes that touch release-related files.
- Fails if source changes were made without version and changelog updates.

### `Publish Desktop`

- Builds the Tauri desktop app with a frozen local minibot sidecar (`desktop/`).
- Publishes GitHub Release `desktop-v<version>`.
- Sends a release notification to ServerlessShip / Feishu.

### `Publish @liuyidi/minibot-client`

- Publishes the shared client package from the same `v<version>` tag.

### `Sync Desktop Release to OSS`

- Downloads desktop release artifacts from GitHub.
- Uploads them to OSS.
- Updates the public release manifest.
- Sends the follow-up Feishu notification.

### `Publish Web & Server (ECS)`

- Separate manual workflow for the Web / server side.
- Deploys the ECS host and sends the deployment notification to Feishu.
- This is not the same as the release tag flow.

## Local guardrails

- `pre-commit` keeps the WebUI copy gates enabled.
- `pre-push` checks release-related changes before push.
- Run `scripts/install-git-hooks.sh` after cloning so the repo-managed hooks are active.

## Recommended policy

- Do not push directly to `main`.
- Use PRs for all normal code changes.
- Trigger releases manually only after merging to `main`.
- Keep tag creation manual so the release point is intentional.

## Common mistakes

- Updating code but forgetting version files.
- Updating version files but not the changelog.
- Trying to create a second release tag for the same version.
- Mixing ECS deployment with the release tag flow.

