import { ArrowUpRight, CheckCircle2, Download, ExternalLink, Monitor, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DownloadPageProps = {
  onOpenApp: () => void;
};

function isZh(locale: string | undefined): boolean {
  return !!locale && locale.toLowerCase().startsWith("zh");
}

export function DownloadPage({ onOpenApp }: DownloadPageProps) {
  const { i18n } = useTranslation();
  const zh = isZh(i18n.resolvedLanguage);

  const copy = zh
    ? {
        eyebrow: "下载应用",
        title: "在所有设备上继续使用 minibot",
        subtitle:
          "Web、移动端和桌面端共用同一套身份与会话。移动端可连接 minibot-react-native，桌面端正在准备中。",
        primary: "打开 Web App",
        secondary: "返回聊天",
        mobileTitle: "移动 App",
        mobileBody: "支持 iOS 和 Android，可连接到 minibot-react-native 作为移动入口。",
        mobileNote: "可连接 minibot-react-native",
        desktopTitle: "桌面 App",
        desktopBody: "Mac 和 Windows 版本正在准备，当前尚未开放下载。",
        desktopNote: "即将开放",
        footer: "移动端将对接 minibot-react-native，桌面端开放后会在这里提供下载。",
        platformStatusReady: "可用",
        platformStatusSoon: "待开放",
      }
    : {
        eyebrow: "Download",
        title: "Keep minibot with you on every device",
        subtitle:
          "Web, mobile, and desktop share the same identity and session. Mobile connects to minibot-react-native, while desktop apps are coming soon.",
        primary: "Open Web App",
        secondary: "Back to chat",
        mobileTitle: "Mobile app",
        mobileBody: "iOS and Android support, powered by minibot-react-native as the companion app.",
        mobileNote: "Connects to minibot-react-native",
        desktopTitle: "Desktop app",
        desktopBody: "Mac and Windows builds are being prepared and are not open yet.",
        desktopNote: "Coming soon",
        footer: "Mobile apps connect through minibot-react-native, and desktop downloads will appear here when ready.",
        platformStatusReady: "Ready",
        platformStatusSoon: "Soon",
      };

  const platforms: Array<{
    title: string;
    subtitle: string;
    note: string;
    status: string;
    icon: ReactNode;
    accent: string;
    border: string;
    chip: string;
    available: boolean;
  }> = [
    {
      title: "iOS",
      subtitle: copy.mobileBody,
      note: copy.mobileNote,
      status: copy.platformStatusReady,
      icon: <Smartphone className="h-5 w-5" />,
      accent: "from-cyan-500/12 to-sky-500/6",
      border: "border-cyan-500/20",
      chip: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
      available: true,
    },
    {
      title: "Android",
      subtitle: copy.mobileBody,
      note: copy.mobileNote,
      status: copy.platformStatusReady,
      icon: <Smartphone className="h-5 w-5" />,
      accent: "from-emerald-500/12 to-teal-500/6",
      border: "border-emerald-500/20",
      chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
      available: true,
    },
    {
      title: "Mac",
      subtitle: copy.desktopBody,
      note: copy.desktopNote,
      status: copy.platformStatusSoon,
      icon: <Monitor className="h-5 w-5" />,
      accent: "from-zinc-500/12 to-slate-500/6",
      border: "border-zinc-500/20",
      chip: "bg-zinc-500/12 text-zinc-700 dark:text-zinc-300",
      available: false,
    },
    {
      title: "Windows",
      subtitle: copy.desktopBody,
      note: copy.desktopNote,
      status: copy.platformStatusSoon,
      icon: <Monitor className="h-5 w-5" />,
      accent: "from-indigo-500/12 to-violet-500/6",
      border: "border-indigo-500/20",
      chip: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
      available: false,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.12),_transparent_28%),radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.08),_transparent_22%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.16))]">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-6 md:px-8 md:py-8">
        <section className="rounded-3xl border border-border/70 bg-card/90 p-6 shadow-[0_20px_50px_-32px_rgb(0_0_0/0.25)] backdrop-blur md:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            <Download className="h-4 w-4 text-primary" />
            <span>{copy.eyebrow}</span>
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-[1.55fr_0.95fr] md:items-end">
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
                {copy.title}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                {copy.subtitle}
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <Button
                type="button"
                onClick={onOpenApp}
                className="h-12 rounded-full px-5 text-sm font-medium shadow-lg shadow-primary/10"
              >
                {copy.primary}
                <ArrowUpRight className="h-4 w-4" />
              </Button>
              <a
                href="/#/new"
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {copy.secondary}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <FeatureCard
            title={copy.mobileTitle}
            body={copy.mobileBody}
            note={copy.mobileNote}
            status={copy.platformStatusReady}
            icon={<Smartphone className="h-5 w-5" />}
            accent="from-cyan-500/10 to-sky-500/5"
            border="border-cyan-500/20"
            chip="bg-cyan-500/12 text-cyan-700 dark:text-cyan-300"
            footer={zh ? "连接到 minibot-react-native" : "Powered by minibot-react-native"}
            available
          />
          <FeatureCard
            title={copy.desktopTitle}
            body={copy.desktopBody}
            note={copy.desktopNote}
            status={copy.platformStatusSoon}
            icon={<Monitor className="h-5 w-5" />}
            accent="from-zinc-500/10 to-slate-500/5"
            border="border-zinc-500/20"
            chip="bg-zinc-500/12 text-zinc-700 dark:text-zinc-300"
            footer={zh ? "桌面应用尚未开放" : "Desktop apps are not open yet"}
            available={false}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {platforms.map((platform) => (
            <article
              key={platform.title}
              className={cn(
                "rounded-3xl border bg-card/90 p-5 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.24)] backdrop-blur",
                platform.border,
                `bg-gradient-to-br ${platform.accent}`,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-background/80 text-foreground shadow-sm">
                      {platform.icon}
                    </span>
                    <span>{platform.title}</span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{platform.subtitle}</p>
                </div>
                <span className={cn("rounded-full px-3 py-1 text-[11px] font-medium", platform.chip)}>
                  {platform.note}
                </span>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/55 pt-4">
                <span className="text-sm font-medium text-foreground/90">{platform.status}</span>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    platform.available
                      ? "border-foreground/10 text-foreground"
                      : "border-border/80 text-muted-foreground",
                  )}
                >
                  {platform.available ? (zh ? "可用" : "Ready") : (zh ? "待开放" : "Soon")}
                </span>
              </div>
            </article>
          ))}
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/80 p-5 text-sm text-muted-foreground shadow-[0_18px_40px_-28px_rgb(0_0_0/0.2)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <p>{copy.footer}</p>
          </div>
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70">
            {zh ? "统一身份 · 统一会话 · 多端同步" : "Single identity · Shared session · Multi-device"}
          </div>
        </section>
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  body,
  note,
  status,
  icon,
  accent,
  border,
  chip,
  footer,
  available,
}: {
  title: string;
  body: string;
  note: string;
  status: string;
  icon: ReactNode;
  accent: string;
  border: string;
  chip: string;
  footer: string;
  available: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-3xl border bg-card/88 p-6 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.22)] backdrop-blur",
        border,
        `bg-gradient-to-br ${accent}`,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/85 text-foreground shadow-sm">
              {icon}
            </span>
            <div>
              <p className="text-lg font-semibold">{title}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{note}</p>
            </div>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">{body}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-[11px] font-medium", chip)}>
          {note}
        </span>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/55 pt-4">
        <p className="text-sm font-medium text-foreground/90">{footer}</p>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            available
              ? "border-foreground/10 text-foreground"
              : "border-border/80 text-muted-foreground",
          )}
        >
          {status}
        </span>
      </div>
    </article>
  );
}
