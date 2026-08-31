import { useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getHostApi } from "@/lib/configs/runtime";
import { cn } from "@/lib/utils";
import { SIDEBAR_ICON } from "./sidebarChrome";

const FALLBACK_APP_VERSION = "0.1.0";

function formatSidebarVersion(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return FALLBACK_APP_VERSION;
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
}

function useSidebarAppVersion(enabled: boolean): string | null {
  const [version, setVersion] = useState<string | null>(enabled ? FALLBACK_APP_VERSION : null);

  useEffect(() => {
    if (!enabled) {
      setVersion(null);
      return;
    }
    let cancelled = false;
    const host = getHostApi();
    if (!host) {
      setVersion(FALLBACK_APP_VERSION);
      return;
    }
    void host.getRuntimeInfo().then(
      (info) => {
        if (cancelled) return;
        setVersion(formatSidebarVersion(info.app_version || FALLBACK_APP_VERSION));
      },
      () => {
        if (!cancelled) setVersion(FALLBACK_APP_VERSION);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return version;
}

export function SidebarBrandHeader({
  collapsed,
  hostChromeInset = false,
  onCollapse,
  onExpand,
}: {
  collapsed: boolean;
  hostChromeInset?: boolean;
  onCollapse: () => void;
  onExpand?: () => void;
}) {
  const { t } = useTranslation();
  const toggleLabel = t("thread.header.toggleSidebar");
  const appVersion = useSidebarAppVersion(Boolean(hostChromeInset) && !collapsed);

  return (
    <div
      className={cn(
        // Logo band: 12px top, 32px content, 16px bottom
        "flex h-8 shrink-0 items-center px-3 mt-3 mb-4",
        hostChromeInset ? "mt-[3.75rem] mb-4" : null,
        collapsed ? "w-14 justify-start" : "justify-between",
      )}
    >
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="sidebar-brand-expand"
              aria-label={toggleLabel}
              onClick={onExpand}
              tabIndex={0}
              className={cn(
                "group relative -ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] transition-colors",
                "hover:bg-[rgb(31_35_41_/0.05)] dark:hover:bg-white/[0.06]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
                aria-hidden
              >
                <img src="/brand/minibot_mark.svg" alt="" className="h-8 w-8 rounded-lg" />
              </span>
              <span
                className="pointer-events-none absolute inset-0 grid place-items-center text-sidebar-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-hidden
              >
                <PanelLeft className={SIDEBAR_ICON} strokeWidth={1.75} />
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" align="center" sideOffset={10}>
            {toggleLabel}
          </TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          aria-label={t("app.brand")}
          aria-hidden
          onClick={undefined}
          tabIndex={-1}
          className={cn(
            "flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-colors",
            "pointer-events-none -ml-0.5 gap-2 px-1",
          )}
        >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              aria-hidden
            >
              <img src="/brand/minibot_mark.svg" alt="" className="h-8 w-8 rounded-lg" />
            </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="max-w-[8rem] truncate text-[18px] font-medium leading-8 text-sidebar-foreground antialiased">
              {t("app.brand")}
            </span>
            {appVersion ? (
              <span
                data-testid="sidebar-app-version"
                className="shrink-0 text-[12px] font-medium leading-8 tracking-tight text-muted-foreground/70"
              >
                v{appVersion}
              </span>
            ) : null}
          </span>
        </button>
      )}
      {!collapsed && !hostChromeInset ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("sidebar.collapse")}
          onClick={onCollapse}
          className={cn(
            "h-8 w-8 shrink-0 rounded-[10px] text-sidebar-foreground shadow-none",
            "hover:bg-[rgb(31_35_41_/0.05)] hover:text-sidebar-foreground",
            "dark:hover:bg-white/[0.06]",
          )}
        >
          <PanelLeft className={SIDEBAR_ICON} strokeWidth={1.75} />
        </Button>
      ) : null}
    </div>
  );
}
