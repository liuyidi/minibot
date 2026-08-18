# Public site (liuyidi.me)

VitePress SSG for `https://liuyidi.me` (portal) and `https://liuyidi.me/minibot/` (简介 / 更新日志).

```bash
cd site
npm ci
npm run docs:dev      # http://localhost:5173
npm run docs:build    # → .vitepress/dist
npm run docs:check    # after build
```

On Aliyun ECS: `deploy/build-site.sh` (one-shot `node:22` container). Nginx root is `site/.vitepress/dist`. Do not put these pages in `webui/`.
