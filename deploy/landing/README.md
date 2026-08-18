# Landing page (legacy nginx root)

**Cutover:** source of truth is now `../../site/` (VitePress). After ECS nginx `root` points at `site/.vitepress/dist` and `../build-site.sh` has been run, delete this directory.

Until then, host nginx may still use:

```text
root /opt/demo/minibot/deploy/landing;
```

See `../nginx.liuyidi.me.conf.example` and `../README.md`.

Previews (do not replace `index.html` until approved):

- V0.1 Option A → https://liuyidi.me/v0.1/ (copied to `site/public/v0.1/` for the new site)
