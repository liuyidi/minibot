import {
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Globe2,
  Laptop,
  QrCode,
  Sparkles,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AndroidIcon, LinuxIcon, WindowsIcon } from "./DownloadPlatformIcons";

const RELEASE_MANIFEST_URL = import.meta.env.VITE_MINIBOT_RELEASES_URL || "/releases.json";

type DownloadPageProps = {
  onOpenApp: () => void;
};

type Platform = "windows" | "macos" | "linux" | "ios" | "android";
type Release = {
  version: string | null;
  fileName?: string;
  size?: string;
  url: string | null;
  /** Intel / x64 macOS DMG (Apple Silicon uses `url`). */
  intelFileName?: string;
  intelSize?: string;
  intelUrl?: string | null;
};
type ReleaseManifest = Record<Platform, Release>;

const EMPTY_MANIFEST: ReleaseManifest = {
  android: { version: null, url: null },
  ios: { version: null, url: null },
  macos: { version: null, url: null, intelUrl: null },
  windows: { version: null, url: null },
  linux: { version: null, url: null },
};

export function DownloadPage({ onOpenApp }: DownloadPageProps) {
  const { t } = useTranslation();
  const [activePlatform, setActivePlatform] = useState<Platform>("macos");
  const manifest = useReleaseManifest();

  useEffect(() => setActivePlatform(detectPreferredPlatform()), []);

  return (
    <main className="min-h-full overflow-y-auto bg-[#f8fafc] text-slate-950 dark:bg-[#090f1a] dark:text-slate-50">
      <div className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_15%_0%,rgba(76,201,180,0.18),transparent_32%),radial-gradient(circle_at_90%_18%,rgba(86,138,255,0.15),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.75),transparent)] dark:bg-[radial-gradient(circle_at_15%_0%,rgba(61,200,179,0.17),transparent_32%),radial-gradient(circle_at_90%_18%,rgba(86,138,255,0.14),transparent_30%),linear-gradient(180deg,rgba(12,19,32,0.8),transparent)]" />

        <section className="mx-auto grid w-full max-w-7xl gap-8 px-5 pb-8 pt-7 md:px-8 md:pb-10 md:pt-10 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur dark:bg-white/[0.06] dark:text-slate-200">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              {t("download.eyebrow")}
            </div>
            <h1 className="mt-4 max-w-xl text-3xl font-semibold tracking-[-0.055em] sm:text-4xl md:text-5xl">
              {t("download.title")}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300 md:text-base md:leading-7">
              {t("download.subtitle")}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                onClick={onOpenApp}
                className="h-12 rounded-full bg-[#122033] px-5 text-sm font-medium text-white shadow-[0_14px_30px_-14px_rgba(15,36,48,0.75)] hover:bg-[#1a2c43] dark:bg-[#8df5d8] dark:text-[#102033] dark:hover:bg-[#b7fbe7]"
              >
                <Globe2 className="h-4 w-4" />
                {t("download.primary")}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <a
                href="/#/new"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-950/[0.05] hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {t("download.secondary")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-600 dark:text-slate-300">
              {[t("download.benefitNoInstall"), t("download.benefitSync"), t("download.benefitPrivate")].map(
                (benefit) => (
                  <span key={benefit} className="inline-flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {benefit}
                  </span>
                ),
              )}
            </div>
          </div>
          <ProductPreview />
        </section>

        <section className="border-y border-slate-200/80 bg-white/75 pt-9 dark:border-white/10 dark:bg-[#0b1422]/75 md:pt-12">
          <div className="mx-auto max-w-7xl px-5 text-center md:px-8">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t("download.platformTitle")}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-500 dark:text-slate-400 md:text-lg">
              {t("download.platformSubtitle")}
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-7xl px-3 md:mt-10 md:px-8">
            <PlatformTabs activePlatform={activePlatform} onChange={setActivePlatform} />
          </div>

          <PlatformPanel platform={activePlatform} release={manifest[activePlatform]} />
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8 md:py-12">
          <div className="flex flex-col gap-4 rounded-[1.6rem] border border-slate-200/80 bg-white/65 px-5 py-4 text-sm shadow-[0_18px_45px_-34px_rgba(15,36,48,0.3)] dark:border-white/10 dark:bg-white/[0.035] md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                <Download className="h-4 w-4" />
              </span>
              <p>{t("download.footer")}</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{t("download.tagline")}</span>
          </div>
          <footer className="mt-6 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
            <a className="transition-colors hover:text-slate-700 dark:hover:text-slate-200" href="https://bot.liuyidi.me">
              bot.liuyidi.me
            </a>
            <span aria-hidden="true">·</span>
            <a
              className="transition-colors hover:text-slate-700 dark:hover:text-slate-200"
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
            >
              {t("download.icp")}
            </a>
          </footer>
        </section>
      </div>
    </main>
  );
}

function useReleaseManifest() {
  const [manifest, setManifest] = useState<ReleaseManifest>(EMPTY_MANIFEST);

  useEffect(() => {
    let cancelled = false;
    void fetch(RELEASE_MANIFEST_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: Partial<ReleaseManifest> | null) => {
        if (!cancelled && payload) {
          setManifest({
            android: { ...EMPTY_MANIFEST.android, ...payload.android },
            ios: { ...EMPTY_MANIFEST.ios, ...payload.ios },
            macos: { ...EMPTY_MANIFEST.macos, ...payload.macos },
            windows: { ...EMPTY_MANIFEST.windows, ...payload.windows },
            linux: { ...EMPTY_MANIFEST.linux, ...payload.linux },
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return manifest;
}

function useQrCode(url: string | null) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);

  return qrDataUrl;
}

function detectPreferredPlatform(): Platform {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/android/.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/.test(userAgent)) return "ios";
  if (/windows/.test(userAgent)) return "windows";
  if (/linux/.test(userAgent)) return "linux";
  return "macos";
}

function platformLabel(platform: Platform): string {
  switch (platform) {
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    case "ios":
      return "iOS";
    case "android":
      return "Android";
  }
}

function PlatformTabs({ activePlatform, onChange }: { activePlatform: Platform; onChange: (platform: Platform) => void }) {
  const platforms: Array<{ id: Platform; label: string; icon: ReactNode; includesLabel?: boolean }> = [
    { id: "windows", label: "Windows", icon: <WindowsIcon /> },
    { id: "macos", label: "macOS", icon: <Laptop /> },
    { id: "linux", label: "Linux", icon: <LinuxIcon /> },
    {
      id: "ios",
      label: "iOS",
      includesLabel: true,
      icon: <img src="/download/ios-tab-mark.png" alt="" className="h-8 w-auto dark:invert md:h-10" />,
    },
    { id: "android", label: "Android", icon: <AndroidIcon /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-3" role="tablist">
      {platforms.map((platform) => {
        const active = platform.id === activePlatform;
        return (
          <button
            key={platform.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={platform.label}
            onClick={() => onChange(platform.id)}
            className={cn(
              "flex h-20 items-center justify-center gap-2 rounded-t-[1.35rem] px-3 text-base font-medium transition-colors md:h-24 md:gap-3 md:px-4 md:text-xl",
              active
                ? "bg-white text-slate-950 shadow-[0_-8px_24px_-20px_rgba(15,36,48,0.45)] dark:bg-[#111e30] dark:text-white"
                : "text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300",
            )}
          >
            <span className="[&>svg]:h-7 [&>svg]:w-7 md:[&>svg]:h-9 md:[&>svg]:w-9">{platform.icon}</span>
            {!platform.includesLabel ? platform.label : null}
          </button>
        );
      })}
    </div>
  );
}

function PlatformPanel({ platform, release }: { platform: Platform; release: Release }) {
  const { t } = useTranslation();
  const qrDataUrl = useQrCode(release.url);
  const isMobile = platform === "ios" || platform === "android";
  const title = `${platformLabel(platform)} ${isMobile ? t("download.mobileTitle") : t("download.desktopTitle")}`;
  const body = isMobile
    ? platform === "ios"
      ? t("download.iosBody")
      : t("download.androidBody")
    : platform === "macos"
      ? t("download.macosBody")
      : platform === "linux"
        ? t("download.linuxBody")
        : t("download.windowsBody");
  const companion = isMobile
    ? platform === "ios"
      ? t("download.iosFooter")
      : t("download.androidFooter")
    : platform === "macos"
      ? t("download.macosFooter")
      : platform === "linux"
        ? t("download.linuxFooter")
        : t("download.windowsFooter");
  const version = release.version ? `v ${release.version}` : null;
  const intelUrl = platform === "macos" ? release.intelUrl ?? null : null;
  const hasDownload = Boolean(release.url || intelUrl);

  return (
    <div className="bg-white dark:bg-[#111e30]">
      <div className="mx-auto grid min-h-[31rem] max-w-7xl gap-10 px-8 py-14 md:grid-cols-2 md:items-center md:px-14 md:py-20 lg:px-20">
        <div className="max-w-xl">
          <h3 className="text-4xl font-semibold tracking-tight md:text-5xl">{title}</h3>
          <ul className="mt-9 space-y-3 text-lg leading-8 text-slate-500 dark:text-slate-300 md:text-xl">
            <li className="flex gap-3"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />{body}</li>
            <li className="flex gap-3"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />{companion}</li>
          </ul>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {hasDownload ? (
              <>
                {release.url ? (
                  <a
                    href={release.url}
                    className="inline-flex h-14 min-w-56 items-center justify-center gap-3 rounded-xl bg-black px-8 text-lg font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-[#8df5d8] dark:text-[#102033] dark:hover:bg-[#b7fbe7]"
                  >
                    <Download className="h-5 w-5" />
                    {platform === "macos" ? t("download.macosAppleSilicon") : t("download.downloadNow")}
                  </a>
                ) : null}
                {intelUrl ? (
                  <a
                    href={intelUrl}
                    className="inline-flex h-14 min-w-56 items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-8 text-lg font-semibold text-slate-900 transition-transform hover:-translate-y-0.5 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    <Download className="h-5 w-5" />
                    {t("download.macosIntel")}
                  </a>
                ) : null}
              </>
            ) : (
              <span className="inline-flex h-14 min-w-56 items-center justify-center rounded-xl bg-slate-100 px-8 text-lg font-semibold text-slate-400 dark:bg-white/10 dark:text-slate-500">
                {t("download.platformStatusSoon")}
              </span>
            )}
          </div>
          {isMobile && qrDataUrl ? (
            <div className="mt-8 flex items-center gap-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-white/[0.96]">
                <img src={qrDataUrl} alt={release.url ?? ""} className="h-28 w-28" />
              </div>
              <div className="space-y-2 text-base text-slate-500 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-200">{t("download.scanToDownload")}</p>
                {version ? <p>{t("download.currentVersion")}：{version}</p> : null}
              </div>
            </div>
          ) : null}
          {version && !(isMobile && qrDataUrl) ? <p className="mt-10 text-base text-slate-500 dark:text-slate-400">{t("download.currentVersion")}：{version}</p> : null}
        </div>

        <div className="relative flex min-h-72 items-center justify-center overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_50%_45%,rgba(141,245,216,0.4),transparent_38%),linear-gradient(135deg,#f1faf8,#e9f1fa)] dark:bg-[radial-gradient(circle_at_50%_45%,rgba(74,201,180,0.25),transparent_38%),linear-gradient(135deg,#0d1b2c,#15283d)] md:min-h-[25rem]">
          {platform === "macos" ? (
            <img
              src="/download/macos-client-preview.png"
              alt="minibot macOS client"
              className="h-full w-full object-contain"
            />
          ) : (
            <img src="/brand/minibot_mark.svg" alt="" className="h-28 w-28 opacity-90 md:h-36 md:w-36" />
          )}
          {!isMobile && qrDataUrl ? (
            <div className="absolute bottom-5 right-5 rounded-2xl bg-white p-3 shadow-xl dark:bg-white/95">
              <img src={qrDataUrl} alt={release.url ?? ""} className="h-24 w-24" />
              <p className="mt-1 text-center text-[10px] font-medium text-slate-600">{t("download.scanToDownload")}</p>
            </div>
          ) : !isMobile ? <QrCode className="absolute bottom-7 right-7 h-12 w-12 text-slate-300/70 dark:text-white/15" /> : null}
        </div>
      </div>
    </div>
  );
}

function ProductPreview() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -right-4 top-10 h-52 w-52 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/75 p-3 shadow-[0_28px_70px_-36px_rgba(15,36,48,0.45)] backdrop-blur dark:border-white/10 dark:bg-[#101b2c]/80">
        <div className="flex items-center gap-1.5 border-b border-slate-200/80 px-2 pb-3 dark:border-white/10"><span className="h-2 w-2 rounded-full bg-rose-400/80" /><span className="h-2 w-2 rounded-full bg-amber-400/80" /><span className="h-2 w-2 rounded-full bg-emerald-400/80" /><div className="ml-3 h-5 flex-1 rounded-md bg-slate-100 dark:bg-white/[0.07]" /></div>
        <div className="grid min-h-[14rem] grid-cols-[7.2rem_1fr] gap-3 p-2 sm:grid-cols-[8.5rem_1fr]">
          <div className="rounded-2xl bg-slate-100/85 p-3 dark:bg-white/[0.055]"><div className="flex items-center gap-2 text-[10px] font-semibold text-slate-700 dark:text-slate-200"><img src="/brand/minibot_mark.svg" alt="" className="h-5 w-5" />minibot</div><div className="mt-6 space-y-3"><div className="h-2 rounded-full bg-slate-300/70 dark:bg-white/20" /><div className="h-2 w-4/5 rounded-full bg-slate-300/55 dark:bg-white/15" /><div className="h-2 w-3/5 rounded-full bg-slate-300/55 dark:bg-white/15" /></div></div>
          <div className="flex flex-col justify-end rounded-2xl bg-[#f6faf9] p-3 dark:bg-[#0b1724]"><div className="max-w-[83%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[10px] leading-4 text-slate-600 shadow-sm dark:bg-white/[0.08] dark:text-slate-300">{t("download.previewPrompt")}</div><div className="mt-3 self-end rounded-2xl rounded-br-md bg-[#8df5d8] px-3 py-2 text-[10px] leading-4 text-[#112337] shadow-sm">{t("download.previewResponse")}</div><div className="mt-3 rounded-xl border border-emerald-500/20 bg-white/80 p-2.5 dark:bg-white/[0.045]"><div className="flex items-center gap-2 text-[10px] font-medium text-slate-700 dark:text-slate-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t("download.previewRunning")}</div><div className="mt-2 h-1.5 w-3/4 rounded-full bg-emerald-500/25" /></div></div>
        </div>
      </div>
    </div>
  );
}
