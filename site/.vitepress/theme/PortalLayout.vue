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
    "hero.eyebrow": "Agent Lab · Personal Stack",
    "hero.title": "自己造的一套<br /><em>Agent 工程栈</em>",
    "hero.lede":
      "从 runtime、可观测、知识库到认证与发布通知：可演示、可部署、可讲清楚设计取舍。不是套壳 demo，是我亲手落地的工程能力。",
    "cta.agent": "打开 Agent",
    "cta.devui": "看开发笔记 /ui",
    "projects.title": "项目与小工具",
    "projects.bot":
      "FastAPI Agent runtime：工具循环、会话、MCP、流式输出；主站是 nanobot WebUI，附属 /ui 讲清实现思路。",
    "projects.overview": "简介 →",
    "projects.mlf":
      "自研可观测：Traces / Sessions / Scores / Evaluators / Playground，Python SDK + LangChain 接入，minibot 每轮对话可上报。",
    "projects.kb":
      "Agent 知识库：文档摄入、切片、向量检索、RAG QA。与 minibot 通过 REST 集成（持续演进中）。",
    "projects.auth":
      "统一身份认证：注册 / 登录 / JWT 刷新 / 登出。FastAPI + PostgreSQL，独立部署在 auth.liuyidi.me。",
    "projects.ship":
      "发布通知小工具：GitHub Release / ECS 部署事件 → 飞书消息卡片。Vercel + Supabase，服务 minibot 等项目的交付闭环。",
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
    "hero.eyebrow": "Agent Lab · Personal Stack",
    "hero.title": "A handmade<br /><em>Agent engineering stack</em>",
    "hero.lede":
      "From runtime, observability, and knowledge base to auth and release notifications: demable, deployable, and explainable. Not a wrapper demo — engineering I shipped myself.",
    "cta.agent": "Open Agent",
    "cta.devui": "Dev notes /ui",
    "projects.title": "Projects & tools",
    "projects.bot":
      "FastAPI agent runtime: tool loop, sessions, MCP, streaming. Main site is nanobot WebUI; /ui explains the implementation.",
    "projects.overview": "Overview →",
    "projects.mlf":
      "Homegrown observability: Traces / Sessions / Scores / Evaluators / Playground, with Python SDK + LangChain. Minibot reports every turn.",
    "projects.kb":
      "Agent knowledge base: ingest, chunking, vector retrieval, RAG QA. Integrated with minibot over REST (still evolving).",
    "projects.auth":
      "Unified auth: sign-up / login / JWT refresh / logout. FastAPI + PostgreSQL at auth.liuyidi.me.",
    "projects.ship":
      "Release notifier: GitHub Release / ECS deploy events → Feishu cards. Vercel + Supabase for the delivery loop around minibot.",
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
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&family=Instrument+Serif:ital@0;1&display=swap"
      rel="stylesheet"
    />
    <div class="grain" aria-hidden="true" />
    <header class="top">
      <a class="brand" href="/">liuyidi<span>.me</span></a>
      <nav>
        <a href="/minibot/">{{ t("nav.overview") }}</a>
        <a href="https://bot.liuyidi.me/">{{ t("nav.agent") }}</a>
        <a href="https://mlf.liuyidi.me/">{{ t("nav.obs") }}</a>
        <a href="https://kb.liuyidi.me/">{{ t("nav.kb") }}</a>
        <a href="https://auth.liuyidi.me/">{{ t("nav.auth") }}</a>
        <a href="https://serverless-ship.liuyidi.me/">{{ t("nav.ship") }}</a>
        <a href="https://github.com/liuyidi" target="_blank" rel="noopener">GitHub</a>
        <select
          id="lang"
          :value="locale"
          aria-label="Language"
          style="
            margin-left: 8px;
            font: inherit;
            font-size: 12px;
            padding: 2px 6px;
            border-radius: 6px;
            border: 1px solid rgba(0, 0, 0, 0.15);
            background: transparent;
          "
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

      <section id="projects" class="projects">
        <h2>{{ t("projects.title") }}</h2>
        <div class="cards">
          <article class="card">
            <h3>minibot + WebUI</h3>
            <p>{{ t("projects.bot") }}</p>
            <p class="card-links">
              <a href="https://bot.liuyidi.me/">bot.liuyidi.me →</a>
              <a href="/minibot/">{{ t("projects.overview") }}</a>
            </p>
          </article>
          <article class="card">
            <h3>mini-langfuse</h3>
            <p>{{ t("projects.mlf") }}</p>
            <p class="card-links">
              <a href="https://mlf.liuyidi.me/">mlf.liuyidi.me →</a>
              <a href="/mini-langfuse/">{{ t("projects.overview") }}</a>
            </p>
          </article>
          <article class="card">
            <h3>minikb</h3>
            <p>{{ t("projects.kb") }}</p>
            <p class="card-links">
              <a href="https://kb.liuyidi.me/">kb.liuyidi.me →</a>
              <a href="/minikb/">{{ t("projects.overview") }}</a>
            </p>
          </article>
          <article class="card">
            <h3>mini-auth</h3>
            <p>{{ t("projects.auth") }}</p>
            <p class="card-links">
              <a href="https://auth.liuyidi.me/">auth.liuyidi.me →</a>
              <a href="/mini-auth/">{{ t("projects.overview") }}</a>
            </p>
          </article>
          <article class="card">
            <h3>ServerlessShip</h3>
            <p>{{ t("projects.ship") }}</p>
            <p class="card-links">
              <a href="https://serverless-ship.liuyidi.me/">serverless-ship.liuyidi.me →</a>
              <a href="/serverless-ship/">{{ t("projects.overview") }}</a>
            </p>
          </article>
        </div>
      </section>

      <section id="skills" class="skills">
        <h2>{{ t("skills.title") }}</h2>
        <ul>
          <li v-html="t('skills.1')" />
          <li v-html="t('skills.2')" />
          <li v-html="t('skills.3')" />
          <li v-html="t('skills.4')" />
        </ul>
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

