import { useEffect, useState, type ReactNode } from "react";
import { PanelLeft, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { NATIVE_SIDEBAR_WIDTH } from "@/layouts/constants";
import { onHostChromeDragMouseDown } from "@/lib/host-window-drag";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    minibotNativeChrome?: boolean;
  }
}

function useNativeChromeControls(): boolean {
  const [native, setNative] = useState(
    () => typeof window !== "undefined" && Boolean(window.minibotNativeChrome),
  );
  useEffect(() => {
    if (window.minibotNativeChrome) {
      setNative(true);
      return;
    }
    const onReady = () => setNative(true);
    window.addEventListener("minibot:native-chrome-ready", onReady);
    const id = window.setInterval(() => {
      if (window.minibotNativeChrome) {
        setNative(true);
        window.clearInterval(id);
      }
    }, 50);
    const stop = window.setTimeout(() => window.clearInterval(id), 5_000);
    return () => {
      window.removeEventListener("minibot:native-chrome-ready", onReady);
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, []);
  return native;
}

/** Absolute top for web fallback chrome actions (tests / non-native). */
const CHROME_ACTIONS_TOP = 16;

/** Vite / localhost only — never on production hosts like bot.liuyidi.me. */
function showLocalWebuiDebugMark(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function HostChrome({
  onToggleSidebar,
  onOpenSearch,
  onSidebarPreviewEnter,
  onSidebarPreviewLeave,
  sidebarOpen = true,
  sidebarWidth = NATIVE_SIDEBAR_WIDTH,
  rightAction,
}: {
  onToggleSidebar?: () => void;
  onOpenSearch?: () => void;
  onSidebarPreviewEnter?: () => void;
  onSidebarPreviewLeave?: () => void;
  sidebarOpen?: boolean;
  sidebarWidth?: number;
  rightAction?: ReactNode;
}) {
  const { t } = useTranslation();
  const nativeChrome = useNativeChromeControls();
  // Desktop installs AppKit buttons; keep web controls only as fallback (e.g. Vitest).
  const showChromeActions = !nativeChrome && Boolean(onToggleSidebar || onOpenSearch);
  const actionsTop = CHROME_ACTIONS_TOP;
  const showDebugMark = showLocalWebuiDebugMark();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-40 h-12 bg-transparent text-foreground/90">
      {/* Drag strip: leave traffic lights + native chrome cluster + right actions clear. */}
      <div
        aria-hidden
        data-tauri-drag-region
        onMouseDown={onHostChromeDragMouseDown}
        className="host-drag-region pointer-events-auto absolute inset-y-0"
        style={{ left: nativeChrome ? 168 : 0, right: 112 }}
      />
      {showDebugMark ? (
        <div
          data-testid="host-chrome-debug-mark"
          className="host-no-drag pointer-events-none absolute left-1/2 top-[10px] z-50 -translate-x-1/2 rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white"
        >
          local-webui
        </div>
      ) : null}
      {showChromeActions ? (
        <div
          data-testid="host-chrome-actions"
          className={cn(
            "host-no-drag pointer-events-auto absolute z-50 flex h-8 items-center gap-1",
          )}
          style={
            sidebarOpen
              ? {
                  top: actionsTop,
                  left: sidebarWidth - 10,
                  transform: "translateX(-100%)",
                }
              : { top: actionsTop, left: 80 }
          }
        >
          {onToggleSidebar ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("thread.header.toggleSidebar")}
              data-testid="host-sidebar-toggle"
              onClick={onToggleSidebar}
              onFocus={!sidebarOpen ? onSidebarPreviewEnter : undefined}
              onBlur={!sidebarOpen ? onSidebarPreviewLeave : undefined}
              onMouseEnter={!sidebarOpen ? onSidebarPreviewEnter : undefined}
              onMouseLeave={!sidebarOpen ? onSidebarPreviewLeave : undefined}
              className="h-8 w-8 rounded-md bg-transparent text-muted-foreground/90 shadow-none hover:bg-transparent hover:text-foreground"
            >
              <PanelLeft className="h-[17px] w-[17px]" strokeWidth={2} />
            </Button>
          ) : null}
          {onOpenSearch ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("sidebar.searchAria")}
              data-testid="host-sidebar-search"
              onClick={onOpenSearch}
              className="h-8 w-8 rounded-md bg-transparent text-muted-foreground/90 shadow-none hover:bg-transparent hover:text-foreground"
            >
              <Search className="h-[17px] w-[17px]" strokeWidth={2} />
            </Button>
          ) : null}
        </div>
      ) : null}
      {rightAction ? (
        <div
          className="host-no-drag pointer-events-auto absolute right-3 flex h-8 items-center"
          style={{ top: actionsTop }}
        >
          {rightAction}
        </div>
      ) : null}
    </header>
  );
}
