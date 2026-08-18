import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",
  title: "minibot",
  titleTemplate: ":title · liuyidi.me",
  description:
    "刘一帝个人页与 minibot 产品简介：Agent runtime、Desktop、更新日志。",
  cleanUrls: true,
  lastUpdated: false,
  srcExclude: ["README.md", ".generated/**"],
  themeConfig: {
    siteTitle: "minibot",
    nav: [
      { text: "liuyidi.me", link: "/" },
      { text: "打开 Agent", link: "https://bot.liuyidi.me/" },
      { text: "GitHub", link: "https://github.com/liuyidi/minibot" },
    ],
    sidebar: {
      "/minibot/": [
        {
          text: "minibot",
          items: [
            { text: "简介", link: "/minibot/" },
            { text: "更新日志", link: "/minibot/changelog/" },
          ],
        },
      ],
    },
    outline: "deep",
    socialLinks: [
      { icon: "github", link: "https://github.com/liuyidi/minibot" },
    ],
  },
  vite: {
    server: {
      fs: {
        allow: [".."],
      },
    },
  },
});
