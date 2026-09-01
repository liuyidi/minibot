import { useEffect, useMemo, useState } from "react";
import i18n from "i18next";

type MobileEntryConfig = {
  enabled: boolean;
  iosUrl: string;
  androidUrl: string;
  fallbackUrl: string;
  title: string;
  description: string;
  delayMs: number;
};

const DEFAULT_CONFIG: MobileEntryConfig = {
  enabled: false,
  iosUrl: "minibot://",
  androidUrl: "minibot://",
  fallbackUrl: "https://liuyidi.me/minibot/download/",
  title: "Open app",
  description: "Continue in the minibot app for the best experience.",
  delayMs: 1200,
};

function getMobileTarget(config: MobileEntryConfig) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  return isIOS ? config.iosUrl : isAndroid ? config.androidUrl : "";
}

function getMobilePlatform() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export default function OpenPage() {
  const [config, setConfig] = useState<MobileEntryConfig>(DEFAULT_CONFIG);
  const t = i18n.getFixedT("zh-CN", "common");
  const [hint, setHint] = useState(t("app.mobileEntry.hint.loading"));
  const [attemptedAutoOpen, setAttemptedAutoOpen] = useState(false);

  const target = useMemo(() => getMobileTarget(config), [config]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/mobile-entry", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cfg = (await res.json()) as Partial<MobileEntryConfig>;
        if (cancelled) return;
        // Blank ios/android URLs from settings must not wipe the minibot:// default.
        const nextConfig: MobileEntryConfig = {
          ...DEFAULT_CONFIG,
          ...cfg,
          enabled: !!cfg.enabled,
          iosUrl: (cfg.iosUrl || "").trim() || DEFAULT_CONFIG.iosUrl,
          androidUrl: (cfg.androidUrl || "").trim() || DEFAULT_CONFIG.androidUrl,
          fallbackUrl: (cfg.fallbackUrl || "").trim() || DEFAULT_CONFIG.fallbackUrl,
          delayMs: Number(cfg.delayMs ?? DEFAULT_CONFIG.delayMs) || DEFAULT_CONFIG.delayMs,
        };
        setConfig(nextConfig);
        if (!nextConfig.enabled) {
          setHint(t("app.mobileEntry.hint.disabled"));
          return;
        }
        if (!getMobileTarget(nextConfig)) {
          setHint(t("app.mobileEntry.hint.missingUrl"));
          return;
        }
        setHint(t("app.mobileEntry.hint.ready"));
      } catch {
        if (!cancelled) {
          setHint(t("app.mobileEntry.hint.loadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config.enabled || !target) return;
    if (getMobilePlatform() === "other") return;

    const delay = Math.max(0, config.delayMs || DEFAULT_CONFIG.delayMs);
    const timer = window.setTimeout(() => {
        setAttemptedAutoOpen(true);
        window.location.href = target;
        if (getMobilePlatform() === "android") {
          window.setTimeout(() => {
            if (document.visibilityState === "visible") {
              setHint(t("app.mobileEntry.hint.androidRetry"));
            }
          }, delay);
        } else {
          window.setTimeout(() => {
            if (document.visibilityState === "visible") {
              setHint(t("app.mobileEntry.hint.iosRetry"));
            }
          }, delay);
        }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [config, target, t]);

  const openApp = () => {
    if (!target) return;
    window.location.href = target;
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_38%),linear-gradient(180deg,#fff7ed_0%,#ffffff_44%,#eef2ff_100%)] px-4 pb-24 pt-3 text-[#111827]">
      <button
        type="button"
        onClick={openApp}
        className="mx-auto flex w-full max-w-[460px] items-center justify-between rounded-full border border-[rgba(148,163,184,0.26)] bg-white/92 px-4 py-3 text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#111827] text-sm font-bold text-white">
            M
          </div>
          <div>
            <div className="text-sm font-semibold leading-5">minibot</div>
            <div className="text-xs text-[#6b7280]">
              {config.enabled ? t("app.mobileEntry.banner.subtitle") : t("app.mobileEntry.banner.disabled")}
            </div>
          </div>
        </div>
        <div className="rounded-full bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white">
          {t("app.mobileEntry.banner.cta")}
        </div>
      </button>

      <main className="mx-auto mt-4 w-full max-w-[460px] rounded-[28px] border border-[rgba(148,163,184,0.24)] bg-white/90 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-md sm:p-7">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#fef3c7] px-3 py-1.5 text-xs font-bold text-[#92400e]">
          bot.liuyidi.me
        </div>
        <h1 className="mb-2 text-[28px] font-semibold leading-tight">
          {t("app.mobileEntry.actions.open")}
        </h1>
        <p className="mb-5 leading-7 text-[#4b5563]">{t("app.mobileEntry.description")}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-full bg-[#111827] px-5 py-3 text-sm font-semibold text-white"
            disabled={!config.enabled || !target}
            onClick={openApp}
          >
            {t("app.mobileEntry.actions.open")}
          </button>
        </div>
        <div className="mt-4 text-sm text-[#6b7280]">{hint}</div>
        {attemptedAutoOpen && (
          <div className="mt-3 rounded-2xl bg-[#eff6ff] px-4 py-3 text-sm leading-6 text-[#1d4ed8]">
            {t("app.mobileEntry.notice.trying")}
          </div>
        )}
        {config.fallbackUrl && (
          <a
            className="mt-3 inline-flex text-sm font-semibold text-[#2563eb]"
            href={config.fallbackUrl}
          >
            {t("app.mobileEntry.actions.download")}
          </a>
        )}
      </main>

    </div>
  );
}
