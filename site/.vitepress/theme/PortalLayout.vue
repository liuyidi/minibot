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
    "hero.eyebrow": "Agent Lab · Personal Stack",
    "hero.title": "自己造的一套<br /><em>Agent 工程栈</em>",
    "hero.lede":
      "Runtime · 可观测 · 知识库 · 认证 · 发布通知。可演示、可部署、可讲清楚取舍。",
    "cta.agent": "打开 Agent",
    "cta.devui": "看开发笔记 /ui",
    "entry.bot.kicker": "01 · Agent",
    "entry.bot.desc": "对话、工具循环、流式输出；可查知识库。",
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
    "path":
      "<strong>建议走查顺序：</strong>先在 Agent 里聊一句 → 打开可观测看 Trace → 再到知识库上传/检索；认证与发布通知可按需打开。",
    "skills.title": "我能讲清楚的能力",
    "skills.1": "<strong>Agent Loop</strong> — 多轮 tool calling、锁与并发、会话持久化",
    "skills.2": "<strong>可观测</strong> — span/trace、评分、评测跑批、SSE 实时刷新",
    "skills.3":
      "<strong>工程交付</strong> — Docker Compose、Nginx HTTPS、国内镜像源、2C2G 省内存部署",
    "skills.4": "<strong>产品化</strong> — 主站 WebUI + DevUI 双轨，既能用又能讲清实现",
  },
  en: {
    "nav.overview": "Overview",
    "nav.agent": "Agent",
    "nav.obs": "Observability",
    "nav.kb": "Knowledge",
    "nav.auth": "Auth",
    "nav.ship": "Tools",
    "nav.github": "GitHub",
    "hero.eyebrow": "Agent Lab · Personal Stack",
    "hero.title": "A handmade<br /><em>Agent engineering stack</em>",
    "hero.lede":
      "Runtime · observability · knowledge · auth · release notify. Demoable, deployable, explainable.",
    "cta.agent": "Open Agent",
    "cta.devui": "Dev notes /ui",
    "entry.bot.kicker": "01 · Agent",
    "entry.bot.desc": "Chat, tool loop, streaming; can query the knowledge base.",
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
    "path":
      "<strong>Suggested walkthrough:</strong> chat in Agent → open Observability for a Trace → upload/search in Knowledge; open Auth or ServerlessShip as needed.",
    "skills.title": "What I can walk through",
    "skills.1":
      "<strong>Agent Loop</strong> — multi-turn tool calling, locks/concurrency, session persistence",
    "skills.2": "<strong>Observability</strong> — span/trace, scoring, eval runs, live SSE",
    "skills.3":
      "<strong>Delivery</strong> — Docker Compose, Nginx HTTPS, CN mirrors, 2C2G-friendly deploy",
    "skills.4": "<strong>Productization</strong> — WebUI + DevUI dual track: usable and explainable",
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
        <h1 v-html="t('hero.title')" />
        <p class="lede">{{ t("hero.lede") }}</p>
        <div class="cta">
          <a class="btn primary" href="https://bot.liuyidi.me/">{{ t("cta.agent") }}</a>
          <a class="btn ghost" href="https://bot.liuyidi.me/ui/">{{ t("cta.devui") }}</a>
        </div>
      </section>

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

      <section class="below">
        <p class="path" v-html="t('path')" />
        <details>
          <summary>{{ t("skills.title") }}</summary>
          <ul>
            <li v-html="t('skills.1')" />
            <li v-html="t('skills.2')" />
            <li v-html="t('skills.3')" />
            <li v-html="t('skills.4')" />
          </ul>
        </details>
      </section>
    </main>

    <footer>
      <p class="beian">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
          >浙ICP备2026062548号-1</a
        >
      </p>
    </footer>
  </div>
</template>
