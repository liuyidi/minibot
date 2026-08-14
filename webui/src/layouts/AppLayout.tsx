import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { AppDialogs } from "@/layouts/chrome/AppDialogs";
import { AppMain } from "@/layouts/chrome/AppMain";
import { AppSidebarChrome } from "@/layouts/chrome/AppSidebarChrome";
import { HostChrome } from "@/layouts/chrome/HostChrome";
import { useAppLayoutModel } from "@/layouts/hooks/useAppLayoutModel";
import { Button } from "@/components/ui/button";
import { ThemeProvider } from "@/hooks/ui";
import { cn } from "@/lib/utils";
import type { RuntimeSurface } from "@/lib/types";

function invokeTauri(cmd: string, args?: Record<string, unknown>): Promise<unknown> | null {
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: (c: string, a?: object) => Promise<unknown> } };
    __TAURI_INTERNALS__?: { invoke?: (c: string, a?: object) => Promise<unknown> };
  };
  const invoke = w.__TAURI__?.core?.invoke || w.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== "function") return null;
  return invoke(cmd, args);
}

export function AppLayout({
  runtimeSurface,
  accountDisplayName,
  onModelNameChange,
  onLogout,
  onNativeEngineRestart,
}: {
  runtimeSurface: RuntimeSurface;
  accountDisplayName?: string | null;
  onModelNameChange: (modelName: string | null) => void;
  onLogout: () => void;
  onNativeEngineRestart: () => Promise<string>;
}) {
  const { t } = useTranslation();
  const model = useAppLayoutModel({ runtimeSurface, accountDisplayName, onModelNameChange });
  const host = { onLogout, onModelNameChange, onNativeEngineRestart };

  useEffect(() => {
    if (!model.workspace.showHostChrome) return;
    const onNativeChrome = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; open?: boolean }>).detail;
      const action = detail?.action;
      if (action === "set-sidebar-open" && typeof detail?.open === "boolean") {
        if (detail.open) model.hostSidebar.openHostSidebar();
        else model.hostSidebar.closeHostSidebar();
        return;
      }
      if (action === "toggle-sidebar") {
        model.hostSidebar.toggleHostSidebar();
        return;
      }
      if (action === "open-search") {
        model.chatActions.onOpenSessionSearch();
        return;
      }
      if (action === "new-chat") {
        void model.chatActions.onNewChat();
      }
    };
    window.addEventListener("minibot:native-chrome", onNativeChrome);
    return () => window.removeEventListener("minibot:native-chrome", onNativeChrome);
  }, [model.chatActions, model.hostSidebar, model.workspace.showHostChrome]);

  useEffect(() => {
    if (!model.workspace.showHostChrome) return;
    const syncNativeChrome = () => {
      const pending = invokeTauri("host_set_native_chrome_sidebar_open", {
        open: model.hostSidebar.hostSidebarOpen,
      });
      if (!pending) {
        console.warn("[host-chrome] invoke unavailable; native cluster may be stale");
        return;
      }
      void pending.catch((err) => {
        console.warn("[host-chrome] host_set_native_chrome_sidebar_open failed", err);
      });
    };
    syncNativeChrome();
    // Re-sync after AppKit overlay install (navigate / page load).
    window.addEventListener("minibot:native-chrome-ready", syncNativeChrome);
    return () => window.removeEventListener("minibot:native-chrome-ready", syncNativeChrome);
  }, [model.hostSidebar.hostSidebarOpen, model.workspace.showHostChrome]);

  useEffect(() => {
    if (!model.workspace.showHostChrome) return;

    let timer: number | undefined;
    const syncTint = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Match what the user actually sees (class applied by useTheme).
        const dark = document.documentElement.classList.contains("dark");
        const pending = invokeTauri("host_set_native_chrome_dark", { dark });
        if (pending) {
          void pending.catch((err) => {
            console.warn("[host-chrome] host_set_native_chrome_dark failed", err);
          });
        }
      }, 40);
    };

    syncTint();
    window.addEventListener("minibot:native-chrome-ready", syncTint);
    const observer = new MutationObserver(syncTint);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("minibot:native-chrome-ready", syncTint);
      observer.disconnect();
    };
  }, [model.theme, model.workspace.showHostChrome]);

  return (
    <ThemeProvider theme={model.theme}>
      <div
        className={cn(
          "relative h-full w-full overflow-hidden",
          model.workspace.showHostChrome && "host-window-shell",
        )}
      >
        {model.workspace.showHostChrome ? (
          <HostChrome
            onToggleSidebar={
              model.workspace.showMainSidebar ? model.hostSidebar.toggleHostSidebar : undefined
            }
            onOpenSearch={
              model.workspace.showMainSidebar
                ? model.chatActions.onOpenSessionSearch
                : undefined
            }
            onSidebarPreviewEnter={model.hostSidebar.openHostSidebarPreview}
            onSidebarPreviewLeave={model.hostSidebar.scheduleHostSidebarPreviewClose}
            sidebarOpen={model.hostSidebar.hostSidebarOpen}
            sidebarWidth={model.hostSidebar.openSidebarWidth}
            rightAction={
              model.view === "chat" ? undefined : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("thread.header.toggleTheme")}
                  onClick={model.toggle}
                  className="h-8 w-8 rounded-full text-muted-foreground/85 hover:bg-accent/40 hover:text-foreground"
                >
                  {model.theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
              )
            }
          />
        ) : null}
        <div className="relative flex h-full w-full overflow-hidden">
          <AppSidebarChrome model={model} />
          <AppMain model={model} host={host} />
        </div>
        <AppDialogs model={model} />
      </div>
    </ThemeProvider>
  );
}
