# Public site (liuyidi.me)

VitePress SSG for `https://liuyidi.me` (portal) and product docs:

- `/` portal · `/minibot/` `/minibot/download/` `/mini-langfuse/` `/minikb/` `/mini-auth/` `/serverless-ship/`
- each product has `/changelog/` (except download is a custom layout page)

```bash
cd site
npm ci
npm run docs:dev      # http://localhost:5173
npm run docs:build    # → .vitepress/dist
npm run docs:check    # after build
```

On Aliyun ECS: `deploy/build-site.sh` (one-shot `node:22` container). Nginx root is `site/.vitepress/dist`. Do not put these pages in `webui/`.
