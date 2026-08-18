import { defineConfig } from "vitepress";

function productSidebar(name, base, introLabel = "功能介绍") {
  return {
    text: name,
    collapsed: true,
    items: [
      { text: introLabel, link: `${base}/` },
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
          { text: "minikb", link: "/minikb/" },
          { text: "mini-langfuse", link: "/mini-langfuse/" },
          { text: "mini-auth", link: "/mini-auth/" },
          { text: "ServerlessShip", link: "/serverless-ship/" },
        ],
      },
      { text: "打开 Agent", link: "https://bot.liuyidi.me/" },
      { text: "GitHub", link: "https://github.com/liuyidi" },
    ],
    sidebar: [
      productSidebar("minibot", "/minibot", "简介"),
      productSidebar("minikb", "/minikb", "简介"),
      productSidebar("mini-langfuse", "/mini-langfuse", "简介"),
      productSidebar("mini-auth", "/mini-auth"),
      productSidebar("ServerlessShip", "/serverless-ship"),
    ],
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
