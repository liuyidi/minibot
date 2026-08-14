import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getHostApi } from "@/lib/configs/runtime";
import { cn } from "@/lib/utils";

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
        "flex items-center px-3 pb-2.5",
        hostChromeInset ? "pt-[3.75rem]" : "pt-3",
        collapsed ? "w-14 justify-start" : "justify-between",
      )}
    >
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={toggleLabel}
              onClick={onExpand}
              tabIndex={0}
              className={cn(
                "flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-colors",
                "-ml-0.5 w-9 hover:bg-sidebar-accent/75",
              )}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-foreground/90 text-[13px] font-semibold tracking-tight text-sidebar"
                aria-hidden
              >
                M
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
            "flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-colors",
            "pointer-events-none -ml-0.5 gap-2 px-1",
          )}
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-foreground/90 text-[13px] font-semibold tracking-tight text-sidebar"
            aria-hidden
          >
            M
          </span>
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="max-w-[7rem] truncate text-[13px] font-semibold tracking-tight text-sidebar-foreground">
              {t("app.brand")}
            </span>
            {appVersion ? (
              <span
                data-testid="sidebar-app-version"
                className="shrink-0 text-[11px] font-medium tracking-tight text-muted-foreground/80"
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
          className="h-7 w-7 rounded-lg text-muted-foreground/85 hover:bg-sidebar-accent/75 hover:text-sidebar-foreground"
        >
          <Menu className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
