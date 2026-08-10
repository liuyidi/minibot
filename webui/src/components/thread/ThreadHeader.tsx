import { Menu, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { onHostChromeDragMouseDown } from "@/lib/host-window-drag";
import { HOST_CHROME_TITLE_INSET_CLASS } from "@/layouts/constants";
import { cn } from "@/lib/utils";

interface ThreadHeaderProps {
  title: string;
  onToggleSidebar: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  hideSidebarToggleForHostChrome?: boolean;
  hostChromeTitleInset?: boolean;
  hideThemeButton?: boolean;
  minimal?: boolean;
  promptNavigatorAction?: ReactNode;
  sessionInfoAction?: ReactNode;
}

export function ThreadHeader({
  title,
  onToggleSidebar,
  theme,
  onToggleTheme,
  hideSidebarToggleForHostChrome = false,
  hostChromeTitleInset = false,
  hideThemeButton = false,
  minimal = false,
  promptNavigatorAction,
  sessionInfoAction,
}: ThreadHeaderProps) {
  const { t } = useTranslation();
  // Desktop host chrome: drag from the title row (avoid growing ThreadShell props).
  const hostChromeDrag = hideSidebarToggleForHostChrome;

  return (
    <div
      data-tauri-drag-region={hostChromeDrag ? true : undefined}
      onMouseDown={hostChromeDrag ? onHostChromeDragMouseDown : undefined}
      className={cn(
        // pt-1 (was py-2): lift title 4px toward the window top.
        "relative z-10 flex items-center justify-between gap-3 px-3 pt-1 pb-2",
        minimal && "h-11",
        hostChromeDrag && "host-drag-region",
        // Keep title clear of traffic lights + fixed native icon cluster (all widths).
        !minimal && hostChromeTitleInset && HOST_CHROME_TITLE_INSET_CLASS,
      )}
    >
      <div className="relative flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("thread.header.toggleSidebar")}
          onClick={onToggleSidebar}
          className={cn(
            "host-no-drag h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent/35 hover:text-foreground",
            // Desktop native chrome already has sidebar/search/new-chat — never show this.
            hideSidebarToggleForHostChrome && "hidden",
          )}
        >
          <Menu className="h-3.5 w-3.5" />
        </Button>
        {!minimal ? (
          <div className="flex min-w-0 items-center rounded-md px-1.5 py-1 text-[15px] font-semibold tracking-tight text-foreground">
            <span className="max-w-[min(60vw,32rem)] truncate">{title}</span>
          </div>
        ) : null}
      </div>

      <div
        data-no-window-drag
        className="host-no-drag relative z-50 ml-auto flex shrink-0 items-center gap-1"
      >
        {sessionInfoAction}
        {promptNavigatorAction}
        {!hideThemeButton ? (
          <ThemeButton
            theme={theme}
            onToggleTheme={onToggleTheme}
            label={t("thread.header.toggleTheme")}
          />
        ) : null}
      </div>

      {!minimal ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-4" />
      ) : null}
    </div>
  );
}

function ThemeButton({
  theme,
  onToggleTheme,
  label,
  className,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onToggleTheme}
      className={cn(
        "host-no-drag h-8 w-8 rounded-full text-muted-foreground/85 dark:text-foreground/90 hover:bg-accent/40 hover:text-foreground",
        className,
      )}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
