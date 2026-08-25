# Public npm install for minibot CLI

Date: 2026-08-25  
Status: approved (pending implementation)

## Goal

Let users install and use the remote minibot CLI like Claude Code / Codex / Gemini CLI:

```bash
npm i -g @liuyidi/minibot
minibot login
minibot chat
```

No git clone, no `uv sync`, no local Gateway required for the default cloud path (`bot.liuyidi.me` + `auth.liuyidi.me`).

## Context

Two different “CLI” surfaces exist today:

| Surface | Package | Role | Download page today |
| --- | --- | --- | --- |
| Python Gateway | `minibot/` (`uv run minibot`) | Local agent runtime | Default install instructions (`git clone` + `uv sync`) |
| TS remote client | `packages/minibot-cli` | login / chat / status / sessions | Not advertised as installable |

Product target (already decided in `2026-08-21-minibot-cli-remote-client-design.md`): the **TS remote client** is the Codex-like UX. This spec only covers **distribution** so that client can be installed from public npm.

## Decisions

| Item | Choice |
| --- | --- |
| Approach | Dual public packages on registry.npmjs.org |
| CLI publish name | `@liuyidi/minibot` |
| CLI repo path | Keep `packages/minibot-cli` |
| CLI bin | `minibot` |
| Client publish name | `@liuyidi/minibot-client` (unchanged) |
| Registry | Public npm (`https://registry.npmjs.org`), `access: public` |
| Stop | New versions of client on GitHub Packages |
| Default UX | Cloud gateway; local Gateway remains advanced docs only |
| Versioning | Align CLI + client with unified release version (e.g. `1.0.17`) |
| Python Gateway | Unchanged for now; docs clarify CLI ≠ Gateway (optional later rename to `minibot-server`) |

## Out of scope

- Embedding AgentLoop / tools into the CLI
- `curl \| sh` binary installers
- Dual-publishing to GitHub Packages and npmjs
- Renaming the Python console script in this change
- Changing CLI command surface (`login` / `chat` / …)

## Package metadata

### `@liuyidi/minibot` (from `packages/minibot-cli`)

- Rename publish `name` from `@liuyidi/minibot-cli` → `@liuyidi/minibot`
- `bin.minibot` → `./dist/index.js` (already)
- `publishConfig.registry` → `https://registry.npmjs.org`
- `publishConfig.access` → `public`
- Add `repository` pointing at `packages/minibot-cli`
- Bump `version` to match the unified release version

### `@liuyidi/minibot-client`

- Change `publishConfig` from GitHub Packages (restricted) → public npm
- Keep published name `@liuyidi/minibot-client`
- Apps may keep import alias `@minibot/client` via npm alias (existing RN pattern)

### Dependency rewrite

| Environment | CLI depends on |
| --- | --- |
| Local monorepo / CI test | `file:../minibot-client` or workspace (unchanged for day-to-day) |
| Published tarball | `"@liuyidi/minibot-client": "<same version>"` |

Source may keep import alias `@minibot/client` if package.json / installs map it; the **published** `dependencies` field must list the real `@liuyidi/minibot-client` name so consumers do not need workspace links.

Implementation options (pick one in the plan, both valid):

1. **CI rewrite before publish** — patch `package.json` in the publish job, then `npm publish`
2. **Committed publish dependency** — store `@liuyidi/minibot-client` version in package.json and use `overrides` / workspaces for local linking

Prefer (1) if it matches current client publish habits; prefer (2) if the monorepo already resolves published names via workspaces.

## Release / CI

1. Add repo secret `NPM_TOKEN` (npm automation token with publish rights for `@liuyidi/*`).
2. Update `.github/workflows/publish-client.yml`:
   - `registry-url: https://registry.npmjs.org`
   - Auth via `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`
3. Add publish for CLI (new workflow or same workflow with ordered jobs):
   - On `v*` tag (and optional `workflow_dispatch`)
   - **Order:** publish client first, then CLI (so CLI’s dependency resolves)
4. Update `docs/release-process.md` to list Publish `@liuyidi/minibot`.
5. One-time human setup:
   - Confirm npm `@liuyidi` org/user owns the names
   - First publish `--access public`
   - Store `NPM_TOKEN` in GitHub Actions secrets

### GitHub Packages migration

- Stop writing new client versions to `npm.pkg.github.com`
- Do not dual-write
- Document that consumers should use registry.npmjs.org; existing GH Packages installs are frozen at last published version

## Download page & docs

`site/.vitepress/theme/DownloadLayout.vue` (and any CLI docs):

```bash
npm i -g @liuyidi/minibot
minibot login && minibot chat
```

- Replace current `git clone` + `uv sync` as the default CLI install block
- Keep “start local Gateway” only under advanced / README local section
- Update `packages/minibot-cli/README.md` Install section to match
- Brief note in getting-started / release docs: product CLI is npm; Python package is the Gateway process

## Acceptance

- From a clean machine with only Node ≥ 18:
  - `npm i -g @liuyidi/minibot` succeeds without GitHub Packages auth
  - `minibot login` / `minibot chat -m "…"` work against cloud defaults
- `npm view @liuyidi/minibot` and `npm view @liuyidi/minibot-client` resolve on registry.npmjs.org
- Download page install commands match the public npm path
- Tag `v*` release publishes both packages in order

## Non-goals / deferred

- Unpublishing or deleting old GitHub Packages artifacts
- `npx @liuyidi/minibot` marketing (works once published; not required on the download page)
- Homebrew / Scoop formulas
