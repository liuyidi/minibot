import { useEffect, useRef, useState } from "react";
import { Moon, PanelLeft, Pencil, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  APP_TOP_CHROME_ROW,
  HEADER_ICON_BUTTON,
  SIDEBAR_ICON,
} from "@/components/sidebar/sidebarChrome";
import { onHostChromeDragMouseDown } from "@/lib/host-window-drag";
import {
  HOST_CHROME_TITLE_INSET_CLASS,
  NATIVE_HOST_TOP_CHROME_ROW,
} from "@/layouts/constants";
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
  /** When set, title is editable (Doubao-style hover pencil → inline input). */
  onRenameTitle?: (title: string) => void;
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
  onRenameTitle,
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
        hostChromeDrag ? NATIVE_HOST_TOP_CHROME_ROW : APP_TOP_CHROME_ROW,
        "relative z-10 justify-between gap-3 px-3",
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
            "host-no-drag",
            HEADER_ICON_BUTTON,
            // Host chrome uses native controls. Desktop web uses logo hover to expand
            // and brand-header PanelLeft to collapse — keep this for mobile sheet only.
            hideSidebarToggleForHostChrome ? "hidden" : "lg:hidden",
          )}
        >
          <PanelLeft className={SIDEBAR_ICON} strokeWidth={1.75} />
        </Button>
        {!minimal ? (
          <EditableThreadTitle title={title} onRenameTitle={onRenameTitle} />
        ) : null}
      </div>

      <div
        data-no-window-drag
        className="host-no-drag relative z-50 ml-auto flex shrink-0 items-center gap-0.5"
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

function EditableThreadTitle({
  title,
  onRenameTitle,
}: {
  title: string;
  onRenameTitle?: (title: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const skipCommitRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<"view" | "edit" | "closing">("view");
  const [draft, setDraft] = useState(title);
  const canRename = typeof onRenameTitle === "function";
  const showInput = phase === "edit" || phase === "closing";
  const isClosing = phase === "closing";

  useEffect(() => {
    if (phase === "view") setDraft(title);
  }, [title, phase]);

  useEffect(() => {
    if (phase !== "edit") return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [phase]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const finishClose = (nextDraft: string, shouldSave: boolean) => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
    }
    setPhase("closing");
    if (shouldSave && canRename) {
      onRenameTitle(nextDraft);
    } else {
      setDraft(title);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setPhase("view");
      closeTimerRef.current = null;
    }, 250);
  };

  const commit = () => {
    const next = draft.trim();
    const shouldSave = Boolean(canRename && next && next !== title.trim());
    finishClose(shouldSave ? next : title, shouldSave);
  };

  if (showInput && canRename) {
    return (
      <input
        ref={inputRef}
        data-testid="thread-title-input"
        value={draft}
        maxLength={160}
        disabled={isClosing}
        aria-label={t("chat.rename")}
        aria-busy={isClosing || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (isClosing) return;
          if (skipCommitRef.current) {
            skipCommitRef.current = false;
            finishClose(title, false);
            return;
          }
          commit();
        }}
        onKeyDown={(event) => {
          if (isClosing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            skipCommitRef.current = true;
            event.currentTarget.blur();
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          "host-no-drag h-8 w-full max-w-[320px] rounded-md border border-[rgb(31_35_41_/0.2)] bg-background px-1.5 py-0.5",
          "text-[15px] font-semibold leading-[22px] tracking-tight text-foreground outline-none",
          "focus-visible:outline-none transition-[opacity,background-color,border-color,color] duration-150",
          isClosing &&
            "cursor-not-allowed border-[rgb(31_35_41_/0.12)] bg-muted/60 text-muted-foreground opacity-70",
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "group/title host-no-drag flex min-w-0 max-w-full items-center gap-2",
        canRename && "cursor-default",
      )}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex min-w-0 items-center rounded-md px-1.5 py-1 text-[15px] font-semibold leading-[22px] tracking-tight text-foreground">
        <span className="max-w-[min(60vw,32rem)] truncate">{title}</span>
      </div>
      {canRename ? (
        <button
          type="button"
          data-testid="thread-title-edit"
          aria-label={t("chat.rename")}
          onClick={() => {
            setDraft(title);
            setPhase("edit");
          }}
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px]",
            "bg-[#f0f0f0] text-[rgb(31,35,41)] transition-opacity",
            "opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100",
            "hover:bg-[#e8e8e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "dark:bg-white/10 dark:text-foreground dark:hover:bg-white/15",
          )}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </button>
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
      className={cn("host-no-drag", HEADER_ICON_BUTTON, className)}
    >
      {theme === "dark" ? (
        <Sun className={SIDEBAR_ICON} strokeWidth={1.75} />
      ) : (
        <Moon className={SIDEBAR_ICON} strokeWidth={1.75} />
      )}
    </Button>
  );
}
