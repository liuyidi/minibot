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
      "打开 DMG，将 minibot 拖入「应用程序」。若提示已损坏，在终端执行 xattr -cr '/Applications/minibot.app'。",
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
    "footer": "桌面端与 Android 安装包通过发布清单同步；iOS 开放后会在这里更新。",
    "tagline": "统一身份 · 统一会话 · 多端同步",
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
      "Open the DMG and drag minibot into Applications. If macOS says it is damaged, run xattr -cr '/Applications/minibot.app'.",
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
    "footer": "Desktop and Android packages sync from the release manifest; iOS will appear here when ready.",
    "tagline": "One identity · one session · every surface",
    "previewPrompt": "Help me organize today's priorities",
    "previewResponse": "Done — synced to your session.",
    "previewRunning": "Agent is running",
  },
};

const locale = ref("zh-CN");
const activePlatform = ref("macos");
const macArch = ref("arm");
const qrDataUrl = ref(null);
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
  { id: "ios", label: "iOS", icon: "ios", hideLabel: true },
  { id: "android", label: "Android", icon: "android" },
];

const release = computed(() => manifest.value[activePlatform.value] ?? { version: null, url: null });
const isMobile = computed(() => activePlatform.value === "ios" || activePlatform.value === "android");

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
      <a class="brand" href="/">liuyidi.me</a>
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
            <img
              v-if="p.icon === 'ios'"
              class="ios-mark"
              src="/download/ios-tab-mark.png"
              alt=""
            />
            <svg v-else-if="p.icon === 'windows'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2.5 3.8 10.7 2.7v8.6H2.5V3.8Zm9.8-1.3L21.5 1v10.3h-9.2V2.5ZM2.5 12.7h8.2v8.6l-8.2-1.1v-7.5Zm9.8 0h9.2V23l-9.2-1.3v-9Z" />
            </svg>
            <svg v-else-if="p.icon === 'macos'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="13" rx="2" />
              <path d="M8 20h8M12 17v3" />
            </svg>
            <svg v-else-if="p.icon === 'linux'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2c-1.4 0-2.6 1.4-2.6 3.2 0 1.3.5 2.4 1.2 3.1-.9.2-1.7.8-2.2 1.6C7.4 11.3 7.2 13 8 14.3c.4.7 1.1 1.2 1.9 1.5-.1.5 0 1 .3 1.5.6 1 1.8 1.5 2.9 1.2.2 0 .4-.1.6-.2.2.1.4.2.6.2 1.1.3 2.3-.2 2.9-1.2.3-.5.4-1 .3-1.5.8-.3 1.5-.8 1.9-1.5.8-1.3.6-3-.4-4.4-.5-.8-1.3-1.4-2.2-1.6.7-.7 1.2-1.8 1.2-3.1C14.6 3.4 13.4 2 12 2Z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.2 8.4 5.7 5.8l.9-.5 1.6 2.8a9.9 9.9 0 0 1 7.6 0l1.6-2.8.9.5-1.5 2.6A7.4 7.4 0 0 1 20 14H4a7.4 7.4 0 0 1 3.2-5.6ZM9 11.5a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Zm6 0a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6ZM5 15h14v4.3a1.7 1.7 0 0 1-1.7 1.7H6.7A1.7 1.7 0 0 1 5 19.3V15Z" />
            </svg>
            <span v-if="!p.hideLabel">{{ p.label }}</span>
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
          <div class="panel-visual">
            <img
              v-if="activePlatform === 'macos'"
              src="/download/macos-client-preview.png"
              alt="minibot macOS client"
            />
            <img v-else class="mark" src="/brand/minibot_mark.svg" alt="" />
            <div v-if="!isMobile && qrDataUrl" class="qr-float">
              <img :src="qrDataUrl" :alt="primaryUrl || ''" width="96" height="96" />
              <p>{{ t("scanToDownload") }}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="foot">
        <p>{{ t("footer") }}</p>
        <p class="tagline">{{ t("tagline") }}</p>
        <p class="legal">
          <a :href="BOT_URL">bot.liuyidi.me</a>
          <span aria-hidden="true"> · </span>
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">{{ ICP }}</a>
        </p>
      </section>
    </main>
  </div>
</template>
