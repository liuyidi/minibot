import { Moon, Sun } from "lucide-react";
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

export function AppLayout({
  runtimeSurface,
  onModelNameChange,
  onLogout,
  onNativeEngineRestart,
}: {
  runtimeSurface: RuntimeSurface;
  onModelNameChange: (modelName: string | null) => void;
  onLogout: () => void;
  onNativeEngineRestart: () => Promise<string>;
}) {
  const { t } = useTranslation();
  const model = useAppLayoutModel({ runtimeSurface, onModelNameChange });
  const host = { onLogout, onModelNameChange, onNativeEngineRestart };

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
            onSidebarPreviewEnter={model.hostSidebar.openHostSidebarPreview}
            onSidebarPreviewLeave={model.hostSidebar.scheduleHostSidebarPreviewClose}
            sidebarOpen={model.hostSidebar.hostSidebarOpen}
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
