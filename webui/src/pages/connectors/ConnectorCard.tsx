import { Loader2, Plug, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ToggleButton } from "@/components/settings/controls";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function ConnectorCard({
  title,
  description,
  badge,
  badgeTone = "muted",
  enabled,
  busy,
  actionLabel,
  actionBusy,
  onAction,
  onToggleEnabled,
  onUninstall,
}: {
  title: string;
  description: string;
  badge?: string;
  badgeTone?: "muted" | "success";
  enabled?: boolean;
  busy?: boolean;
  actionLabel?: string;
  actionBusy?: boolean;
  onAction?: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onUninstall?: () => void;
}) {
  const { t } = useTranslation();
  const managed = Boolean(onToggleEnabled || onUninstall);

  return (
    <div
      className={cn(
        "group relative flex min-h-[7.5rem] flex-col gap-2 rounded-[18px] border border-border/45 bg-card/70 p-4",
        managed && enabled === false && "opacity-70",
      )}
    >
      {onAction ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute right-3 top-3 h-8 w-8 rounded-full"
          disabled={actionBusy}
          onClick={onAction}
          aria-label={actionLabel}
        >
          {actionBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
        </Button>
      ) : null}

      {managed ? (
        <div className="absolute right-3 top-3 z-[1] flex items-center gap-1.5">
          {onUninstall ? (
            <TooltipProvider delayDuration={200} skipDelayDuration={80}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onUninstall}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground",
                      "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                      "hover:bg-destructive/10 hover:text-destructive",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:pointer-events-none disabled:opacity-40",
                    )}
                    aria-label={t("settings.skills.uninstallConnector", {
                      name: title,
                      defaultValue: "Uninstall {{name}}",
                    })}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  {t("settings.skills.uninstallTooltip", { defaultValue: "Uninstall" })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {onToggleEnabled && typeof enabled === "boolean" ? (
            <ToggleButton
              tone="accent"
              checked={enabled}
              disabled={busy}
              label={
                enabled
                  ? t("settings.skills.disable", { defaultValue: "Disable" })
                  : t("settings.skills.enable", { defaultValue: "Enable" })
              }
              onChange={(next) => {
                if (next === enabled) return;
                onToggleEnabled(next);
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div className={cn("flex items-start gap-3", (onAction || managed) && "pr-16")}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-muted/80 text-muted-foreground">
          <Plug className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-foreground">{title}</h3>
          <p className="mt-1 line-clamp-3 text-[12.5px] leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {badge ? (
        <span
          className={cn(
            "mt-auto w-fit rounded-full px-2 py-0.5 text-[11px] font-medium",
            badgeTone === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}
