<script setup>
import { computed, onMounted, ref, watch } from "vue";
import QRCode from "qrcode";
import "./download.css";

const RELEASE_MANIFEST_URL = "https://downloads.liuyidi.me/minibot/releases.json";
const BOT_URL = "https://bot.liuyidi.me/";
const ICP = "浙ICP备2026062548号-1";

const STORAGE_KEY = "landing.locale";

const messages = {
  "zh-CN": {
    "nav.home": "门户",
    "nav.minibot": "简介",
    "nav.agent": "打开 Agent",
    "eyebrow": "下载应用",
    "title": "在每台设备上，继续你的 minibot",
    "subtitle":
      "Web、Android 与桌面端（macOS / Windows / Linux）共用同一套身份与会话；iOS 客户端即将开放。",
    "primary": "打开 Web App",
    "benefitNoInstall": "Web 无需安装",
    "benefitSync": "会话持续同步",
    "benefitPrivate": "连接自己的 minibot",
    "platformTitle": "选择适合你的设备",
    "platformSubtitle": "Web App、Android 与桌面端现已可下载；iOS 客户端正在准备中。",
    "mobileTitle": "移动 App",
    "desktopTitle": "桌面 App",
    "iosBody": "支持 iOS 14.0 及更高版本的操作系统。",
    "iosFooter": "iOS 客户端正在准备，开放后可从 App Store / TestFlight 安装。",
    "androidBody": "支持 Android 8.0 及更高版本的操作系统。",
    "androidFooter": "扫描下方二维码或点击下载，即可安装 Android 客户端。",
    "macosBody": "支持 Apple 芯片（Apple Silicon）与 Intel 芯片的 Mac。",
    "macosFooter":
      "打开 DMG，将 minibot 拖入「应用程序」。",
    "windowsBody": "Windows x64 安装包（NSIS）。",
    "windowsFooter": "运行安装程序即可。在代码签名完成前，SmartScreen 可能会提示警告。",
    "linuxBody": "Linux x64 安装包（优先 .deb）。",
    "linuxFooter": "使用发行版自带的包管理器安装下载的文件。",
    "macosAppleSilicon": "下载 Apple Silicon 版",
    "macosIntel": "下载 Intel 版",
    "macosAlsoAvailable": "也可下载：",
    "downloadNow": "立即下载",
    "platformStatusSoon": "待开放",
    "currentVersion": "当前版本",
    "scanToDownload": "扫码下载",
    "cli.title": "更想用 CLI？",
    "cli.body": "适合服务器、远程开发机和无界面环境。与 Desktop 同一套 Gateway 协议，终端里安装与启动。",
    "cli.installLabel": "安装",
    "cli.startLabel": "启动 gateway",
    "cli.note": "已有本机或云主机时，同样的命令可在 SSH 会话里执行。",
    "cli.more": "查看 CLI 说明 →",
    "cli.copy": "复制",
    "cli.copied": "已复制",
    "previewPrompt": "帮我整理今天的工作重点",
    "previewResponse": "已完成整理，并同步到你的会话。",
    "previewRunning": "Agent 正在执行",
  },
  en: {
    "nav.home": "Portal",
    "nav.minibot": "Overview",
    "nav.agent": "Open Agent",
    "eyebrow": "Download",
    "title": "Keep minibot with you on every device",
    "subtitle":
      "Web, Android, and desktop (macOS / Windows / Linux) share the same identity and sessions. iOS is coming soon.",
    "primary": "Open Web App",
    "benefitNoInstall": "No install for Web",
    "benefitSync": "Sessions stay in sync",
    "benefitPrivate": "Connect your own minibot",
    "platformTitle": "Pick your device",
    "platformSubtitle": "Web, Android, and desktop are ready; iOS is in preparation.",
    "mobileTitle": "Mobile app",
    "desktopTitle": "Desktop app",
    "iosBody": "Requires iOS 14.0 or later.",
    "iosFooter": "iOS is coming soon via App Store / TestFlight.",
    "androidBody": "Requires Android 8.0 or later.",
    "androidFooter": "Scan the QR code or tap download to install the Android client.",
    "macosBody": "Supports Apple Silicon and Intel Macs.",
    "macosFooter":
      "Open the DMG and drag minibot into Applications.",
    "windowsBody": "Windows x64 installer (NSIS).",
    "windowsFooter": "Run the installer. SmartScreen may warn until code signing is complete.",
    "linuxBody": "Linux x64 package (prefer .deb).",
    "linuxFooter": "Install with your distribution's package manager.",
    "macosAppleSilicon": "Download Apple Silicon",
    "macosIntel": "Download Intel",
    "macosAlsoAvailable": "Also available: ",
    "downloadNow": "Download now",
    "platformStatusSoon": "Coming soon",
    "currentVersion": "Current version",
    "scanToDownload": "Scan to download",
    "cli.title": "Prefer the CLI?",
    "cli.body": "For servers, remote dev boxes, and headless setups. Same Gateway protocol as Desktop — install and run from the terminal.",
    "cli.installLabel": "Install",
    "cli.startLabel": "Start gateway",
    "cli.note": "Already on a server? The same commands work over SSH.",
    "cli.more": "CLI docs →",
    "cli.copy": "Copy",
    "cli.copied": "Copied",
    "previewPrompt": "Help me organize today's priorities",
    "previewResponse": "Done — synced to your session.",
    "previewRunning": "Agent is running",
  },
};

const locale = ref("zh-CN");
const activePlatform = ref("macos");
const macArch = ref("arm");
const qrDataUrl = ref(null);
const copiedKey = ref("");
const CLI_INSTALL =
  "git clone https://github.com/liuyidi/minibot.git && cd minibot/minibot && uv sync --all-extras";
const CLI_START = "uv run minibot";
const manifest = ref({
  android: { version: null, url: null },
  ios: { version: null, url: null },
  macos: { version: null, url: null, intelUrl: null },
  windows: { version: null, url: null },
  linux: { version: null, url: null },
});

function t(key) {
  return messages[locale.value]?.[key] ?? messages["zh-CN"][key] ?? key;
}

async function copyCommand(key, text) {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    window.setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = "";
    }, 1600);
  } catch {
    /* ignore */
  }
}

function onLocaleChange(event) {
  const next = event.target.value;
  locale.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

function detectPreferredPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/windows/.test(ua)) return "windows";
  if (/linux/.test(ua)) return "linux";
  return "macos";
}

async function detectMacArch() {
  const uaData = navigator.userAgentData;
  if (uaData?.getHighEntropyValues) {
    try {
      const { architecture } = await uaData.getHighEntropyValues(["architecture"]);
      if (architecture) {
        macArch.value = architecture === "arm" ? "arm" : "intel";
        return;
      }
    } catch {
      /* ignore */
    }
  }
  macArch.value = "arm";
}

async function loadManifest() {
  try {
    const response = await fetch(RELEASE_MANIFEST_URL);
    if (!response.ok) return;
    const payload = await response.json();
    manifest.value = {
      android: { ...manifest.value.android, ...payload.android },
      ios: { ...manifest.value.ios, ...payload.ios },
      macos: { ...manifest.value.macos, ...payload.macos },
      windows: { ...manifest.value.windows, ...payload.windows },
      linux: { ...manifest.value.linux, ...payload.linux },
    };
  } catch {
    /* keep empty */
  }
}

const platforms = [
  { id: "windows", label: "Windows", icon: "windows" },
  { id: "macos", label: "macOS", icon: "macos" },
  { id: "linux", label: "Linux", icon: "linux" },
  { id: "ios", label: "iOS", icon: "ios" },
  { id: "android", label: "Android", icon: "android" },
];

const release = computed(() => manifest.value[activePlatform.value] ?? { version: null, url: null });
const isMobile = computed(() => activePlatform.value === "ios" || activePlatform.value === "android");

const panelShot = computed(() => {
  if (activePlatform.value === "ios" || activePlatform.value === "android") {
    return {
      src: "/minibot/app-chat.png",
      alt: "minibot App",
      className: "shot phone",
    };
  }
  return {
    src: "/minibot/macos-client-preview.png",
    alt: "minibot Desktop",
    className: "shot desktop",
  };
});

const primaryUrl = computed(() => {
  const r = release.value;
  if (activePlatform.value !== "macos") return r.url ?? null;
  const arm = r.url ?? null;
  const intel = r.intelUrl ?? null;
  return macArch.value === "arm" ? arm || intel : intel || arm;
});

const primaryLabel = computed(() => {
  if (activePlatform.value !== "macos") return t("downloadNow");
  const r = release.value;
  if (macArch.value === "arm" && r.url) return t("macosAppleSilicon");
  if (macArch.value === "intel" && r.intelUrl) return t("macosIntel");
  return t("downloadNow");
});

const alternate = computed(() => {
  if (activePlatform.value !== "macos") return null;
  const arm = release.value.url;
  const intel = release.value.intelUrl;
  if (!arm || !intel) return null;
  return macArch.value === "arm"
    ? { url: intel, label: t("macosIntel") }
    : { url: arm, label: t("macosAppleSilicon") };
});

const panelTitle = computed(() => {
  const label =
    activePlatform.value === "macos"
      ? "macOS"
      : activePlatform.value === "windows"
        ? "Windows"
        : activePlatform.value === "linux"
          ? "Linux"
          : activePlatform.value === "ios"
            ? "iOS"
            : "Android";
  return `${label} ${isMobile.value ? t("mobileTitle") : t("desktopTitle")}`;
});

const panelBody = computed(() => {
  switch (activePlatform.value) {
    case "ios":
      return t("iosBody");
    case "android":
      return t("androidBody");
    case "macos":
      return t("macosBody");
    case "linux":
      return t("linuxBody");
    default:
      return t("windowsBody");
  }
});

const panelFooter = computed(() => {
  switch (activePlatform.value) {
    case "ios":
      return t("iosFooter");
    case "android":
      return t("androidFooter");
    case "macos":
      return t("macosFooter");
    case "linux":
      return t("linuxFooter");
    default:
      return t("windowsFooter");
  }
});

watch(
  primaryUrl,
  async (url) => {
    if (!url) {
      qrDataUrl.value = null;
      return;
    }
    try {
      qrDataUrl.value = await QRCode.toDataURL(url, {
        width: 360,
        margin: 1,
        errorCorrectionLevel: "M",
      });
    } catch {
      qrDataUrl.value = null;
    }
  },
  { immediate: true },
);

onMounted(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh-CN") locale.value = saved;
  } catch {
    /* ignore */
  }
  activePlatform.value = detectPreferredPlatform();
  void detectMacArch();
  void loadManifest();
});
</script>

<template>
  <div class="download-root">
    <header class="top">
      <a class="brand" href="/">Minibot</a>
      <nav>
        <a href="/">{{ t("nav.home") }}</a>
        <a href="/minibot/">{{ t("nav.minibot") }}</a>
        <a :href="BOT_URL">{{ t("nav.agent") }}</a>
        <select class="lang" :value="locale" aria-label="Language" @change="onLocaleChange">
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </nav>
    </header>

    <main>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">{{ t("eyebrow") }}</p>
          <h1>{{ t("title") }}</h1>
          <p class="lede">{{ t("subtitle") }}</p>
          <div class="cta">
            <a class="btn primary" :href="BOT_URL">{{ t("primary") }}</a>
          </div>
          <ul class="benefits">
            <li>{{ t("benefitNoInstall") }}</li>
            <li>{{ t("benefitSync") }}</li>
            <li>{{ t("benefitPrivate") }}</li>
          </ul>
        </div>
        <div class="preview" aria-hidden="true">
          <div class="preview-window">
            <div class="preview-dots"><span /><span /><span /></div>
            <div class="preview-body">
              <div class="preview-side">
                <div class="preview-brand">
                  <img src="/brand/minibot_mark.svg" alt="" width="20" height="20" />
                  minibot
                </div>
              </div>
              <div class="preview-chat">
                <p class="bubble in">{{ t("previewPrompt") }}</p>
                <p class="bubble out">{{ t("previewResponse") }}</p>
                <p class="running">{{ t("previewRunning") }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="platforms">
        <div class="platforms-head">
          <h2>{{ t("platformTitle") }}</h2>
          <p>{{ t("platformSubtitle") }}</p>
        </div>

        <div class="tabs" role="tablist">
          <button
            v-for="p in platforms"
            :key="p.id"
            type="button"
            role="tab"
            class="tab"
            :class="{ active: activePlatform === p.id }"
            :aria-selected="activePlatform === p.id"
            :aria-label="p.label"
            @click="activePlatform = p.id"
          >
            <svg
              v-if="p.icon === 'ios'"
              class="ios-mark"
              viewBox="0 0 384 512"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9m-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3" />
            </svg>
            <svg v-else-if="p.icon === 'windows'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2.5 3.8 10.7 2.7v8.6H2.5V3.8Zm9.8-1.3L21.5 1v10.3h-9.2V2.5ZM2.5 12.7h8.2v8.6l-8.2-1.1v-7.5Zm9.8 0h9.2V23l-9.2-1.3v-9Z" />
            </svg>
            <svg
              v-else-if="p.icon === 'macos'"
              class="macos-mark"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="m8.809 14.92 6.11-11.037c.084-.152.168-.302.244-.459.069-.142.127-.285.165-.44.08-.326.058-.666-.066-.977a1.5 1.5 0 0 0-.62-.735 1.42 1.42 0 0 0-.922-.193c-.32.043-.613.194-.844.43-.11.11-.2.235-.283.368-.092.146-.175.298-.259.45l-.386.697-.387-.698c-.084-.151-.167-.303-.259-.449a2.2 2.2 0 0 0-.283-.369 1.45 1.45 0 0 0-.844-.429 1.42 1.42 0 0 0-.921.193 1.5 1.5 0 0 0-.62.735 1.6 1.6 0 0 0-.066.977c.038.155.096.298.164.44.076.157.16.307.244.459l1.248 2.254-4.862 8.782H2.03c-.168 0-.336 0-.503.01-.152.009-.3.028-.448.071-.31.09-.582.28-.778.548A1.58 1.58 0 0 0 .3 17.404c.197.268.468.457.779.548.148.043.296.062.448.071.167.01.335.01.503.01h13.097a2 2 0 0 0 .1-.27c.415-1.416-.616-2.844-2.035-2.844zm-5.696 3.622-.792 1.5c-.082.156-.165.31-.239.471a2.4 2.4 0 0 0-.16.452 1.7 1.7 0 0 0 .064 1.003c.121.318.334.583.607.755s.589.242.901.197c.314-.044.6-.198.826-.44.108-.115.196-.242.278-.378.09-.15.171-.306.253-.462L6 19.464c-.09-.15-.947-1.47-2.887-.922m20.586-3.006a1.47 1.47 0 0 0-.779-.54 2 2 0 0 0-.448-.071c-.168-.01-.335-.01-.503-.01h-3.321L14.258 7.1a4.06 4.06 0 0 0-1.076 2.198 4.64 4.64 0 0 0 .546 3l5.274 9.393c.084.15.167.3.259.444.084.13.174.253.283.364.231.232.524.38.845.423s.643-.024.922-.19a1.5 1.5 0 0 0 .621-.726c.125-.307.146-.642.066-.964a2.2 2.2 0 0 0-.165-.434c-.075-.155-.16-.303-.244-.453l-1.216-2.166h1.596c.168 0 .335 0 .503-.009.152-.009.3-.028.448-.07a1.47 1.47 0 0 0 .78-.541 1.54 1.54 0 0 0 .3-.916 1.54 1.54 0 0 0-.3-.916" />
            </svg>
            <svg
              v-else-if="p.icon === 'linux'"
              class="linux-mark"
              viewBox="0 0 448 512"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M220.8 123.3c1 .5 1.8 1.7 3 1.7 1.1 0 2.8-.4 2.9-1.5.2-1.4-1.9-2.3-3.2-2.9-1.7-.7-3.9-1-5.5-.1-.4.2-.8.7-.6 1.1.3 1.3 2.3 1.1 3.4 1.7m-21.9 1.7c1.2 0 2-1.2 3-1.7 1.1-.6 3.1-.4 3.5-1.6.2-.4-.2-.9-.6-1.1-1.6-.9-3.8-.6-5.5.1-1.3.6-3.4 1.5-3.2 2.9.1 1 1.8 1.5 2.8 1.4M420 403.8c-3.6-4-5.3-11.6-7.2-19.7-1.8-8.1-3.9-16.8-10.5-22.4-1.3-1.1-2.6-2.1-4-2.9-1.3-.8-2.7-1.5-4.1-2 9.2-27.3 5.6-54.5-3.7-79.1-11.4-30.1-31.3-56.4-46.5-74.4-17.1-21.5-33.7-41.9-33.4-72C311.1 85.4 315.7.1 234.8 0 132.4-.2 158 103.4 156.9 135.2c-1.7 23.4-6.4 41.8-22.5 64.7-18.9 22.5-45.5 58.8-58.1 96.7-6 17.9-8.8 36.1-6.2 53.3-6.5 5.8-11.4 14.7-16.6 20.2-4.2 4.3-10.3 5.9-17 8.3s-14 6-18.5 14.5c-2.1 3.9-2.8 8.1-2.8 12.4 0 3.9.6 7.9 1.2 11.8 1.2 8.1 2.5 15.7.8 20.8-5.2 14.4-5.9 24.4-2.2 31.7 3.8 7.3 11.4 10.5 20.1 12.3 17.3 3.6 40.8 2.7 59.3 12.5 19.8 10.4 39.9 14.1 55.9 10.4 11.6-2.6 21.1-9.6 25.9-20.2 12.5-.1 26.3-5.4 48.3-6.6 14.9-1.2 33.6 5.3 55.1 4.1.6 2.3 1.4 4.6 2.5 6.7v.1c8.3 16.7 23.8 24.3 40.3 23 16.6-1.3 34.1-11 48.3-27.9 13.6-16.4 36-23.2 50.9-32.2 7.4-4.5 13.4-10.1 13.9-18.3.4-8.2-4.4-17.3-15.5-29.7M223.7 87.3c9.8-22.2 34.2-21.8 44-.4 6.5 14.2 3.6 30.9-4.3 40.4-1.6-.8-5.9-2.6-12.6-4.9 1.1-1.2 3.1-2.7 3.9-4.6 4.8-11.8-.2-27-9.1-27.3-7.3-.5-13.9 10.8-11.8 23-4.1-2-9.4-3.5-13-4.4-1-6.9-.3-14.6 2.9-21.8M183 75.8c10.1 0 20.8 14.2 19.1 33.5-3.5 1-7.1 2.5-10.2 4.6 1.2-8.9-3.3-20.1-9.6-19.6-8.4.7-9.8 21.2-1.8 28.1 1 .8 1.9-.2-5.9 5.5-15.6-14.6-10.5-52.1 8.4-52.1m-13.6 60.7c6.2-4.6 13.6-10 14.1-10.5 4.7-4.4 13.5-14.2 27.9-14.2 7.1 0 15.6 2.3 25.9 8.9 6.3 4.1 11.3 4.4 22.6 9.3 8.4 3.5 13.7 9.7 10.5 18.2-2.6 7.1-11 14.4-22.7 18.1-11.1 3.6-19.8 16-38.2 14.9-3.9-.2-7-1-9.6-2.1-8-3.5-12.2-10.4-20-15-8.6-4.8-13.2-10.4-14.7-15.3q-2.1-7.35 4.2-12.3m3.3 334c-2.7 35.1-43.9 34.4-75.3 18-29.9-15.8-68.6-6.5-76.5-21.9-2.4-4.7-2.4-12.7 2.6-26.4v-.2c2.4-7.6.6-16-.6-23.9-1.2-7.8-1.8-15 .9-20 3.5-6.7 8.5-9.1 14.8-11.3 10.3-3.7 11.8-3.4 19.6-9.9 5.5-5.7 9.5-12.9 14.3-18 5.1-5.5 10-8.1 17.7-6.9 8.1 1.2 15.1 6.8 21.9 16l19.6 35.6c9.5 19.9 43.1 48.4 41 68.9m-1.4-25.9c-4.1-6.6-9.6-13.6-14.4-19.6 7.1 0 14.2-2.2 16.7-8.9 2.3-6.2 0-14.9-7.4-24.9-13.5-18.2-38.3-32.5-38.3-32.5-13.5-8.4-21.1-18.7-24.6-29.9s-3-23.3-.3-35.2c5.2-22.9 18.6-45.2 27.2-59.2 2.3-1.7.8 3.2-8.7 20.8-8.5 16.1-24.4 53.3-2.6 82.4.6-20.7 5.5-41.8 13.8-61.5 12-27.4 37.3-74.9 39.3-112.7 1.1.8 4.6 3.2 6.2 4.1 4.6 2.7 8.1 6.7 12.6 10.3 12.4 10 28.5 9.2 42.4 1.2 6.2-3.5 11.2-7.5 15.9-9 9.9-3.1 17.8-8.6 22.3-15 7.7 30.4 25.7 74.3 37.2 95.7 6.1 11.4 18.3 35.5 23.6 64.6 3.3-.1 7 .4 10.9 1.4 13.8-35.7-11.7-74.2-23.3-84.9-4.7-4.6-4.9-6.6-2.6-6.5 12.6 11.2 29.2 33.7 35.2 59 2.8 11.6 3.3 23.7.4 35.7 16.4 6.8 35.9 17.9 30.7 34.8-2.2-.1-3.2 0-4.2 0 3.2-10.1-3.9-17.6-22.8-26.1-19.6-8.6-36-8.6-38.3 12.5-12.1 4.2-18.3 14.7-21.4 27.3-2.8 11.2-3.6 24.7-4.4 39.9-.5 7.7-3.6 18-6.8 29-32.1 22.9-76.7 32.9-114.3 7.2m257.4-11.5c-.9 16.8-41.2 19.9-63.2 46.5-13.2 15.7-29.4 24.4-43.6 25.5s-26.5-4.8-33.7-19.3c-4.7-11.1-2.4-23.1 1.1-36.3 3.7-14.2 9.2-28.8 9.9-40.6.8-15.2 1.7-28.5 4.2-38.7 2.6-10.3 6.6-17.2 13.7-21.1.3-.2.7-.3 1-.5.8 13.2 7.3 26.6 18.8 29.5 12.6 3.3 30.7-7.5 38.4-16.3 9-.3 15.7-.9 22.6 5.1 9.9 8.5 7.1 30.3 17.1 41.6 10.6 11.6 14 19.5 13.7 24.6M173.3 148.7c2 1.9 4.7 4.5 8 7.1 6.6 5.2 15.8 10.6 27.3 10.6 11.6 0 22.5-5.9 31.8-10.8 4.9-2.6 10.9-7 14.8-10.4s5.9-6.3 3.1-6.6-2.6 2.6-6 5.1c-4.4 3.2-9.7 7.4-13.9 9.8-7.4 4.2-19.5 10.2-29.9 10.2s-18.7-4.8-24.9-9.7c-3.1-2.5-5.7-5-7.7-6.9-1.5-1.4-1.9-4.6-4.3-4.9-1.4-.1-1.8 3.7 1.7 6.5" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.2 8.4 5.7 5.8l.9-.5 1.6 2.8a9.9 9.9 0 0 1 7.6 0l1.6-2.8.9.5-1.5 2.6A7.4 7.4 0 0 1 20 14H4a7.4 7.4 0 0 1 3.2-5.6ZM9 11.5a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Zm6 0a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6ZM5 15h14v4.3a1.7 1.7 0 0 1-1.7 1.7H6.7A1.7 1.7 0 0 1 5 19.3V15Z" />
            </svg>
            <span>{{ p.label }}</span>
          </button>
        </div>

        <div class="panel">
          <div class="panel-copy">
            <h3>{{ panelTitle }}</h3>
            <ul>
              <li>{{ panelBody }}</li>
              <li>{{ panelFooter }}</li>
            </ul>
            <div class="actions">
              <a v-if="primaryUrl" class="btn download" :href="primaryUrl">{{ primaryLabel }}</a>
              <span v-else class="btn soon">{{ t("platformStatusSoon") }}</span>
              <a v-if="alternate" class="alt" :href="alternate.url">
                {{ t("macosAlsoAvailable") }}{{ alternate.label }}
              </a>
            </div>
            <div v-if="isMobile && qrDataUrl" class="qr-row">
              <img :src="qrDataUrl" :alt="primaryUrl || ''" width="112" height="112" />
              <div>
                <p class="qr-title">{{ t("scanToDownload") }}</p>
                <p v-if="release.version">{{ t("currentVersion") }}：v {{ release.version }}</p>
              </div>
            </div>
            <p v-else-if="release.version" class="version">
              {{ t("currentVersion") }}：v {{ release.version }}
            </p>
          </div>
          <div class="panel-visual" :class="{ phone: isMobile }">
            <img
              :src="panelShot.src"
              :alt="panelShot.alt"
              :class="panelShot.className"
            />
            <div v-if="!isMobile && qrDataUrl" class="qr-float">
              <img :src="qrDataUrl" :alt="primaryUrl || ''" width="96" height="96" />
              <p>{{ t("scanToDownload") }}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="cli" aria-labelledby="cli-title">
        <div class="cli-copy">
          <h2 id="cli-title">{{ t("cli.title") }}</h2>
          <p>{{ t("cli.body") }}</p>
        </div>
        <div class="cli-steps">
          <div class="cli-step">
            <div class="cli-step-head">
              <span>{{ t("cli.installLabel") }}</span>
              <button
                type="button"
                class="cli-copy-btn"
                @click="copyCommand('install', CLI_INSTALL)"
              >
                {{ copiedKey === "install" ? t("cli.copied") : t("cli.copy") }}
              </button>
            </div>
            <pre><code>{{ CLI_INSTALL }}</code></pre>
          </div>
          <div class="cli-step">
            <div class="cli-step-head">
              <span>{{ t("cli.startLabel") }}</span>
              <button
                type="button"
                class="cli-copy-btn"
                @click="copyCommand('start', CLI_START)"
              >
                {{ copiedKey === "start" ? t("cli.copied") : t("cli.copy") }}
              </button>
            </div>
            <pre><code>{{ CLI_START }}</code></pre>
          </div>
        </div>
        <p class="cli-note">
          {{ t("cli.note") }}
          <a href="/minibot/cli/">{{ t("cli.more") }}</a>
        </p>
      </section>

      <section class="foot">
        <p class="legal">
          <a :href="BOT_URL">bot.liuyidi.me</a>
          <span aria-hidden="true"> · </span>
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">{{ ICP }}</a>
        </p>
      </section>
    </main>
  </div>
</template>
