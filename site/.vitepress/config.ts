import { defineConfig } from "vitepress";

function productSidebar(name, base) {
  return {
    text: name,
    items: [
      { text: "简介", link: `${base}/` },
      { text: "更新日志", link: `${base}/changelog/` },
    ],
  };
}

export default defineConfig({
  lang: "zh-CN",
  title: "liuyidi.me",
  titleTemplate: ":title · liuyidi.me",
  description:
    "刘一帝个人页与 Agent 工程栈简介：minibot、mini-langfuse、minikb、mini-auth、ServerlessShip。",
  cleanUrls: true,
  lastUpdated: false,
  srcExclude: ["README.md", ".generated/**"],
  themeConfig: {
    siteTitle: "liuyidi.me",
    nav: [
      { text: "门户", link: "/" },
      {
        text: "产品",
        items: [
          { text: "minibot", link: "/minibot/" },
          { text: "mini-langfuse", link: "/mini-langfuse/" },
          { text: "minikb", link: "/minikb/" },
          { text: "mini-auth", link: "/mini-auth/" },
          { text: "ServerlessShip", link: "/serverless-ship/" },
        ],
      },
      { text: "打开 Agent", link: "https://bot.liuyidi.me/" },
      { text: "GitHub", link: "https://github.com/liuyidi" },
    ],
    sidebar: {
      "/minibot/": [productSidebar("minibot", "/minibot")],
      "/mini-langfuse/": [productSidebar("mini-langfuse", "/mini-langfuse")],
      "/minikb/": [productSidebar("minikb", "/minikb")],
      "/mini-auth/": [productSidebar("mini-auth", "/mini-auth")],
      "/serverless-ship/": [productSidebar("ServerlessShip", "/serverless-ship")],
    },
    outline: "deep",
    socialLinks: [{ icon: "github", link: "https://github.com/liuyidi" }],
  },
  vite: {
    server: {
      fs: {
        allow: [".."],
      },
    },
  },
});
