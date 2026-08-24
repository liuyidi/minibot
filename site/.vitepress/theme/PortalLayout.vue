<script setup>
import { computed, onMounted, ref } from "vue";
import "./portal.css";

const STORAGE_KEY = "landing.locale";

const messages = {
  "zh-CN": {
    "nav.overview": "简介",
    "nav.agent": "Agent",
    "nav.obs": "可观测",
    "nav.kb": "知识库",
    "nav.auth": "认证",
    "nav.ship": "小工具",
    "nav.github": "GitHub",
    "hero.eyebrow": "minibot",
    "hero.title": "本地优先的 AI Agent 运行时",
    "hero.lede":
      "Web / Desktop / App 同一套协议；飞书、微信把任务交给同一个 runtime。能调工具、改文件、跑命令，不只是聊天。",
    "cta.agent": "打开 Agent",
    "cta.desktop": "下载 Desktop",
    "pillar.surfaces.title": "多端",
    "pillar.surfaces.tags": "Web · Desktop · App",
    "pillar.surfaces.body": "同一套 REST + WebSocket。会话协议不绑死在某一个客户端上。",
    "pillar.channels.title": "多渠道",
    "pillar.channels.tags": "飞书 · 微信 iLink",
    "pillar.channels.body": "扫码接入与配对；IM 里的任务进同一个 Agent Loop。",
    "pillar.agent.title": "Agent",
    "pillar.agent.tags": "工具循环 · 文件 · exec / MCP / Skills · HITL · Cron",
    "pillar.agent.body": "不像聊天框。更接近 OpenClaw 这类能交付结果的 runtime。",
    "shot.caption": "本机 gateway，会话留在这台电脑。",
    "series.title": "系列",
    "entry.bot.kicker": "01 · Agent",
    "entry.bot.desc": "FastAPI runtime：工具循环、会话、MCP、流式输出。",
    "entry.bot.go": "打开 bot.liuyidi.me →",
    "entry.mlf.kicker": "02 · Observability",
    "entry.mlf.desc": "Traces / Sessions / Scores；看清每一轮 Agent。",
    "entry.mlf.go": "打开 mlf.liuyidi.me →",
    "entry.kb.kicker": "03 · Knowledge",
    "entry.kb.desc": "上传、切片、检索、RAG；给 Agent 喂知识。",
    "entry.kb.go": "打开 kb.liuyidi.me →",
    "entry.auth.kicker": "04 · Auth",
    "entry.auth.desc": "注册 / 登录 / JWT；统一身份认证服务。",
    "entry.auth.go": "打开 auth.liuyidi.me →",
    "entry.ship.kicker": "05 · Tools",
    "entry.ship.desc": "发布与部署事件 → 飞书通知卡片。",
    "entry.ship.go": "打开 serverless-ship.liuyidi.me →",
    "footer.devui": "开发实验室 DevUI",
  },
  en: {
    "nav.overview": "Overview",
    "nav.agent": "Agent",
    "nav.obs": "Observability",
    "nav.kb": "Knowledge",
    "nav.auth": "Auth",
    "nav.ship": "Tools",
    "nav.github": "GitHub",
    "hero.eyebrow": "minibot",
    "hero.title": "A local-first AI agent runtime",
    "hero.lede":
      "One protocol for Web / Desktop / App. Feishu and WeChat talk to the same runtime. Tools, files, and commands — not just chat.",
    "cta.agent": "Open Agent",
    "cta.desktop": "Download Desktop",
    "pillar.surfaces.title": "Surfaces",
    "pillar.surfaces.tags": "Web · Desktop · App",
    "pillar.surfaces.body": "The same REST + WebSocket stack. Sessions are not tied to one client.",
    "pillar.channels.title": "Channels",
    "pillar.channels.tags": "Feishu · WeChat iLink",
    "pillar.channels.body": "Scan to pair. IM tasks enter the same agent loop.",
    "pillar.agent.title": "Agent",
    "pillar.agent.tags": "Tool loop · Files · exec / MCP / Skills · HITL · Cron",
    "pillar.agent.body": "Closer to OpenClaw-style runtimes that ship work, not a chat box.",
    "shot.caption": "Local gateway — sessions stay on this machine.",
    "series.title": "Series",
    "entry.bot.kicker": "01 · Agent",
    "entry.bot.desc": "FastAPI runtime: tool loop, sessions, MCP, streaming.",
    "entry.bot.go": "Open bot.liuyidi.me →",
    "entry.mlf.kicker": "02 · Observability",
    "entry.mlf.desc": "Traces / Sessions / Scores — inspect every agent turn.",
    "entry.mlf.go": "Open mlf.liuyidi.me →",
    "entry.kb.kicker": "03 · Knowledge",
    "entry.kb.desc": "Ingest, chunk, retrieve, RAG — feed knowledge to the agent.",
    "entry.kb.go": "Open kb.liuyidi.me →",
    "entry.auth.kicker": "04 · Auth",
    "entry.auth.desc": "Sign-up / login / JWT — unified auth service.",
    "entry.auth.go": "Open auth.liuyidi.me →",
    "entry.ship.kicker": "05 · Tools",
    "entry.ship.desc": "Release & deploy events → Feishu notification cards.",
    "entry.ship.go": "Open serverless-ship.liuyidi.me →",
    "footer.devui": "Dev Lab DevUI",
  },
};

const locale = ref("zh-CN");

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "zh-CN" || saved === "en") {
    locale.value = saved;
  }
  document.documentElement.lang = locale.value;
});

const dict = computed(() => messages[locale.value] ?? messages["zh-CN"]);

function t(key) {
  return dict.value[key] ?? key;
}

function onLocaleChange(event) {
  const next = event.target.value === "en" ? "en" : "zh-CN";
  locale.value = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
}
</script>

<template>
  <div class="portal-root">
    <header class="top">
      <a class="brand" href="/">liuyidi.me</a>
      <nav>
        <a href="/minibot/">{{ t("nav.overview") }}</a>
        <a href="https://bot.liuyidi.me/">{{ t("nav.agent") }}</a>
        <a href="https://mlf.liuyidi.me/">{{ t("nav.obs") }}</a>
        <a href="https://kb.liuyidi.me/">{{ t("nav.kb") }}</a>
        <a href="https://auth.liuyidi.me/">{{ t("nav.auth") }}</a>
        <a href="https://serverless-ship.liuyidi.me/">{{ t("nav.ship") }}</a>
        <a href="https://github.com/liuyidi" target="_blank" rel="noopener">{{
          t("nav.github")
        }}</a>
        <select
          id="lang"
          class="lang"
          :value="locale"
          aria-label="Language"
          @change="onLocaleChange"
        >
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </nav>
    </header>

    <main>
      <section class="hero">
        <p class="eyebrow">{{ t("hero.eyebrow") }}</p>
        <h1>{{ t("hero.title") }}</h1>
        <p class="lede">{{ t("hero.lede") }}</p>
        <div class="cta">
          <a class="btn primary" href="https://bot.liuyidi.me/">{{ t("cta.agent") }}</a>
          <a class="btn ghost" href="/minibot/download/">{{
            t("cta.desktop")
          }}</a>
        </div>
      </section>

      <section class="pillars" aria-label="Capabilities">
        <article class="pillar">
          <h2>{{ t("pillar.surfaces.title") }}</h2>
          <p class="tags">{{ t("pillar.surfaces.tags") }}</p>
          <p>{{ t("pillar.surfaces.body") }}</p>
        </article>
        <article class="pillar">
          <h2>{{ t("pillar.channels.title") }}</h2>
          <p class="tags">{{ t("pillar.channels.tags") }}</p>
          <p>{{ t("pillar.channels.body") }}</p>
        </article>
        <article class="pillar">
          <h2>{{ t("pillar.agent.title") }}</h2>
          <p class="tags">{{ t("pillar.agent.tags") }}</p>
          <p>{{ t("pillar.agent.body") }}</p>
        </article>
      </section>

      <figure class="shot">
        <img
          src="/minibot/macos-client-preview.png"
          width="1600"
          height="1000"
          alt="minibot Desktop：侧栏对话与频道，主区是输入、权限和模型"
        />
        <p>{{ t("shot.caption") }}</p>
      </figure>

      <p class="section-title">{{ t("series.title") }}</p>
      <section class="entries" aria-label="Product entries">
        <a class="entry" href="https://bot.liuyidi.me/">
          <span class="kicker">{{ t("entry.bot.kicker") }}</span>
          <h2>minibot</h2>
          <p>{{ t("entry.bot.desc") }}</p>
          <span class="go">{{ t("entry.bot.go") }}</span>
        </a>
        <a class="entry" href="https://mlf.liuyidi.me/">
          <span class="kicker">{{ t("entry.mlf.kicker") }}</span>
          <h2>mini-langfuse</h2>
          <p>{{ t("entry.mlf.desc") }}</p>
          <span class="go">{{ t("entry.mlf.go") }}</span>
        </a>
        <a class="entry" href="https://kb.liuyidi.me/ui/">
          <span class="kicker">{{ t("entry.kb.kicker") }}</span>
          <h2>minikb</h2>
          <p>{{ t("entry.kb.desc") }}</p>
          <span class="go">{{ t("entry.kb.go") }}</span>
        </a>
        <a class="entry" href="https://auth.liuyidi.me/">
          <span class="kicker">{{ t("entry.auth.kicker") }}</span>
          <h2>mini-auth</h2>
          <p>{{ t("entry.auth.desc") }}</p>
          <span class="go">{{ t("entry.auth.go") }}</span>
        </a>
        <a class="entry" href="https://serverless-ship.liuyidi.me/">
          <span class="kicker">{{ t("entry.ship.kicker") }}</span>
          <h2>ServerlessShip</h2>
          <p>{{ t("entry.ship.desc") }}</p>
          <span class="go">{{ t("entry.ship.go") }}</span>
        </a>
      </section>
    </main>

    <footer>
      <p class="note">
        <a href="https://bot.liuyidi.me/ui/">
          <svg
            class="note-icon"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="currentColor"
              d="M9.5 3a1 1 0 0 0-.95.68L7.1 8H4a1 1 0 1 0 0 2h.55l1.2 7.2A2 2 0 0 0 7.73 19h8.54a2 2 0 0 0 1.98-1.8L19.45 10H20a1 1 0 1 0 0-2h-3.1l-1.45-4.32A1 1 0 0 0 14.5 3h-5Zm.72 2h3.56l1.1 3.25H9.12L10.22 5ZM8.58 17l-.83-5h8.5l-.83 5H8.58Z"
            />
          </svg>
          {{ t("footer.devui") }}
        </a>
      </p>
      <p class="beian">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
          >浙ICP备2026062548号-1</a
        >
      </p>
    </footer>
  </div>
</template>
