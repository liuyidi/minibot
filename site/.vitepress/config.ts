import { defineConfig } from "vitepress";

function productSidebar(name, base, introLabel = "功能介绍", extraItems = []) {
  return {
    text: name,
    collapsed: true,
    items: [
      { text: introLabel, link: `${base}/` },
      ...extraItems,
      { text: "更新日志", link: `${base}/changelog/` },
    ],
  };
}

export default defineConfig({
  lang: "zh-CN",
  title: "Minibot",
  titleTemplate: ":title · Minibot",
  description:
    "Minibot：本地优先的 AI Agent 运行时；Web / Desktop / App / CLI，以及 mini-langfuse、minikb、mini-auth、ServerlessShip。",
  cleanUrls: true,
  lastUpdated: false,
  srcExclude: ["README.md", ".generated/**"],
  themeConfig: {
    siteTitle: "Minibot",
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
      productSidebar("minibot", "/minibot", "简介", [
        { text: "Web", link: "/minibot/web/" },
        { text: "Desktop", link: "/minibot/desktop/" },
        { text: "App", link: "/minibot/app/" },
        { text: "CLI", link: "/minibot/cli/" },
        { text: "下载", link: "/minibot/download/" },
      ]),
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
