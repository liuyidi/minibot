import {
  Apple,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Globe2,
  Monitor,
  QrCode,
  Smartphone,
  Sparkles,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DOWNLOAD_LANDING_URL = "https://bot.liuyidi.me/#/download/";
const RELEASE_MANIFEST_URL = import.meta.env.VITE_MINIBOT_RELEASES_URL || "/releases.json";

type DownloadPageProps = {
  onOpenApp: () => void;
};

type DownloadTab = "web" | "mobile" | "desktop";
type Release = { version: string | null; fileName?: string; size?: string; url: string | null };
type ReleaseManifest = {
  android: Release;
  ios: Release;
  macos: Release;
  windows: Release;
};

const EMPTY_MANIFEST: ReleaseManifest = {
  android: { version: null, url: null },
  ios: { version: null, url: null },
  macos: { version: null, url: null },
  windows: { version: null, url: null },
};

export function DownloadPage({ onOpenApp }: DownloadPageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DownloadTab>("web");
  const manifest = useReleaseManifest();
  const landingQr = useLandingQr();

  useEffect(() => setActiveTab(detectPreferredTab()), []);

  return (
    <main className="min-h-full overflow-y-auto bg-[#f8fafc] text-slate-950 dark:bg-[#090f1a] dark:text-slate-50">
      <div className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_15%_0%,rgba(76,201,180,0.18),transparent_32%),radial-gradient(circle_at_90%_18%,rgba(86,138,255,0.15),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.75),transparent)] dark:bg-[radial-gradient(circle_at_15%_0%,rgba(61,200,179,0.17),transparent_32%),radial-gradient(circle_at_90%_18%,rgba(86,138,255,0.14),transparent_30%),linear-gradient(180deg,rgba(12,19,32,0.8),transparent)]" />

        <section className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-14 pt-10 md:px-8 md:pb-20 md:pt-16 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur dark:bg-white/[0.06] dark:text-slate-200">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              {t("download.eyebrow")}
            </div>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-[-0.055em] sm:text-5xl md:text-6xl">
              {t("download.title")}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300 md:text-lg md:leading-8">
              {t("download.subtitle")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
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
            <div className="mt-9 flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-600 dark:text-slate-300">
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

        <section className="mx-auto w-full max-w-7xl px-5 pb-16 md:px-8 md:pb-24">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 shadow-[0_24px_70px_-40px_rgba(15,36,48,0.35)] backdrop-blur dark:border-white/10 dark:bg-white/[0.045]">
            <div className="flex flex-col gap-4 border-b border-slate-200/80 px-5 pb-5 pt-6 dark:border-white/10 md:flex-row md:items-end md:justify-between md:px-7">
              <div>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{t("download.availableEyebrow")}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{t("download.platformTitle")}</h2>
              </div>
              <div className="inline-flex w-fit rounded-xl bg-slate-100 p-1 dark:bg-white/[0.07]" role="tablist">
                <TabButton active={activeTab === "web"} icon={<Globe2 />} onClick={() => setActiveTab("web")} label="Web" />
                <TabButton active={activeTab === "mobile"} icon={<Smartphone />} onClick={() => setActiveTab("mobile")} label={t("download.mobileTitle")} />
                <TabButton active={activeTab === "desktop"} icon={<Monitor />} onClick={() => setActiveTab("desktop")} label={t("download.desktopTitle")} />
              </div>
            </div>
            <DownloadTabPanel
              activeTab={activeTab}
              manifest={manifest}
              landingQr={landingQr}
              onOpenApp={onOpenApp}
            />
          </div>

          <div className="mt-5 flex flex-col gap-4 rounded-[1.6rem] border border-slate-200/80 bg-white/65 px-5 py-4 text-sm shadow-[0_18px_45px_-34px_rgba(15,36,48,0.3)] dark:border-white/10 dark:bg-white/[0.035] md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                <Download className="h-4 w-4" />
              </span>
              <p>{t("download.footer")}</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{t("download.tagline")}</span>
          </div>
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

function useLandingQr() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(DOWNLOAD_LANDING_URL, { width: 360, margin: 1, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return qrDataUrl;
}

function detectPreferredTab(): DownloadTab {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(userAgent)) return "mobile";
  if (/macintosh|mac os|windows/.test(userAgent)) return "desktop";
  return "web";
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
        active ? "bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
      )}
    >
      <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      {label}
    </button>
  );
}

function DownloadTabPanel({ activeTab, manifest, landingQr, onOpenApp }: { activeTab: DownloadTab; manifest: ReleaseManifest; landingQr: string | null; onOpenApp: () => void }) {
  const { t } = useTranslation();
  const panels = useMemo(() => ({
    web: <WebPanel onOpenApp={onOpenApp} />,
    mobile: <div className="grid gap-4 lg:grid-cols-[1fr_1fr_14rem]"><ReleaseCard title="iOS" detail={t("download.mobileBody")} icon={<Apple />} release={manifest.ios} /><ReleaseCard title="Android" detail={t("download.mobileBody")} icon={<Smartphone />} release={manifest.android} /><QrPanel qrDataUrl={landingQr} /></div>,
    desktop: <div className="grid gap-4 md:grid-cols-2"><ReleaseCard title="macOS" detail={t("download.desktopBody")} icon={<Monitor />} release={manifest.macos} /><ReleaseCard title="Windows" detail={t("download.desktopBody")} icon={<Monitor />} release={manifest.windows} /></div>,
  }), [landingQr, manifest, onOpenApp, t]);

  return <div className="p-5 md:p-7" role="tabpanel">{panels[activeTab]}</div>;
}

function WebPanel({ onOpenApp }: { onOpenApp: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-48 flex-col justify-between gap-6 rounded-2xl bg-[#102033] p-6 text-white md:flex-row md:items-center md:p-8">
      <div className="max-w-xl">
        <div className="flex items-center gap-2 text-sm font-medium text-[#8df5d8]"><Globe2 className="h-4 w-4" /> Web App</div>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight">{t("download.primary")}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("download.subtitle")}</p>
      </div>
      <Button type="button" onClick={onOpenApp} className="h-11 shrink-0 rounded-full bg-[#8df5d8] px-5 text-[#102033] hover:bg-[#b7fbe7]">
        {t("download.primary")}<ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ReleaseCard({ title, detail, icon, release }: { title: string; detail: string; icon: ReactNode; release: Release }) {
  const { t } = useTranslation();
  const published = Boolean(release.url);
  const meta = [release.version ? `v${release.version}` : null, release.size, release.fileName].filter(Boolean).join(" · ");
  return (
    <article className={cn("flex min-h-52 flex-col rounded-2xl border p-5", published ? "border-emerald-500/25 bg-emerald-500/[0.055]" : "border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.025]")}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", published ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-slate-200/70 text-slate-500 dark:bg-white/10 dark:text-slate-400")}>{icon}</span>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", published ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-slate-200/75 text-slate-500 dark:bg-white/10 dark:text-slate-400")}>{published ? t("download.platformAvailable") : t("download.platformUnavailable")}</span>
      </div>
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{detail}</p>
      {meta ? <p className="mt-3 break-all text-xs text-slate-400 dark:text-slate-500">{meta}</p> : null}
      <div className="mt-auto pt-5">
        {published ? <a href={release.url!} className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-950 px-4 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-[#8df5d8] dark:text-[#102033]"><Download className="h-3.5 w-3.5" />{t("download.primary")}</a> : <span className="inline-flex h-9 items-center rounded-full border border-slate-200 px-4 text-xs font-medium text-slate-400 dark:border-white/10">{t("download.platformStatusSoon")}</span>}
      </div>
    </article>
  );
}

function QrPanel({ qrDataUrl }: { qrDataUrl: string | null }) {
  const { t } = useTranslation();
  return (
    <aside className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-white/10 dark:bg-white/[0.025]">
      {qrDataUrl ? <img src={qrDataUrl} alt={DOWNLOAD_LANDING_URL} className="h-28 w-28 rounded-lg" /> : <QrCode className="h-24 w-24 text-slate-300 dark:text-slate-600" />}
      <p className="mt-3 text-sm font-medium">minibot</p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t("download.mobileFooter")}</p>
    </aside>
  );
}

function ProductPreview() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -right-4 top-10 h-52 w-52 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/75 p-3 shadow-[0_28px_70px_-36px_rgba(15,36,48,0.45)] backdrop-blur dark:border-white/10 dark:bg-[#101b2c]/80">
        <div className="flex items-center gap-1.5 border-b border-slate-200/80 px-2 pb-3 dark:border-white/10"><span className="h-2 w-2 rounded-full bg-rose-400/80" /><span className="h-2 w-2 rounded-full bg-amber-400/80" /><span className="h-2 w-2 rounded-full bg-emerald-400/80" /><div className="ml-3 h-5 flex-1 rounded-md bg-slate-100 dark:bg-white/[0.07]" /></div>
        <div className="grid min-h-[19rem] grid-cols-[7.2rem_1fr] gap-3 p-2 sm:grid-cols-[8.5rem_1fr]">
          <div className="rounded-2xl bg-slate-100/85 p-3 dark:bg-white/[0.055]"><div className="flex items-center gap-2 text-[10px] font-semibold text-slate-700 dark:text-slate-200"><img src="/brand/minibot_mark.svg" alt="" className="h-5 w-5" />minibot</div><div className="mt-6 space-y-3"><div className="h-2 rounded-full bg-slate-300/70 dark:bg-white/20" /><div className="h-2 w-4/5 rounded-full bg-slate-300/55 dark:bg-white/15" /><div className="h-2 w-3/5 rounded-full bg-slate-300/55 dark:bg-white/15" /></div></div>
          <div className="flex flex-col justify-end rounded-2xl bg-[#f6faf9] p-3 dark:bg-[#0b1724]"><div className="max-w-[83%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[10px] leading-4 text-slate-600 shadow-sm dark:bg-white/[0.08] dark:text-slate-300">{t("download.previewPrompt")}</div><div className="mt-3 self-end rounded-2xl rounded-br-md bg-[#8df5d8] px-3 py-2 text-[10px] leading-4 text-[#112337] shadow-sm">{t("download.previewResponse")}</div><div className="mt-3 rounded-xl border border-emerald-500/20 bg-white/80 p-2.5 dark:bg-white/[0.045]"><div className="flex items-center gap-2 text-[10px] font-medium text-slate-700 dark:text-slate-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t("download.previewRunning")}</div><div className="mt-2 h-1.5 w-3/4 rounded-full bg-emerald-500/25" /></div></div>
        </div>
      </div>
      <div className="absolute -bottom-6 -left-4 hidden w-40 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#17253a]/90 sm:block"><div className="flex items-center gap-2"><img src="/brand/minibot_mark.svg" alt="" className="h-7 w-7" /><div className="space-y-1"><div className="h-1.5 w-14 rounded-full bg-slate-400/45 dark:bg-white/30" /><div className="h-1.5 w-10 rounded-full bg-emerald-500/45" /></div></div></div>
    </div>
  );
}
