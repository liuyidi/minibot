import { Brain, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ToggleButton } from "@/components/settings/controls";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatUnavailableReason,
  resolveSkillDescription,
  resolveSkillTitle,
  type SkillCatalogLookup,
} from "@/lib/skills/display";
import type { SkillSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SkillCard({
  skill,
  busy,
  preferZh = false,
  catalog,
  onSelect,
  onToggleEnabled,
  onUninstall,
}: {
  skill: SkillSummary;
  busy?: boolean;
  preferZh?: boolean;
  catalog?: SkillCatalogLookup | null;
  onSelect: (skill: SkillSummary) => void;
  onToggleEnabled?: (skill: SkillSummary, enabled: boolean) => void;
  onUninstall?: (skill: SkillSummary) => void;
}) {
  const { t } = useTranslation();
  const displayOpts = { preferZh, catalog };
  const enabled = skill.enabled !== false;
  const canUninstall = skill.source === "workspace" && Boolean(onUninstall);
  const title = resolveSkillTitle(skill, t, displayOpts);
  const uninstallLabel = t("settings.skills.uninstall", {
    name: title,
    defaultValue: "Uninstall {{name}}",
  });

  return (
    <div
      className={cn(
        "group relative flex min-h-[7.5rem] flex-col gap-2 rounded-[18px] border border-border/45 bg-card/70 p-4 text-left transition-colors",
        "hover:bg-muted/40",
        (!skill.available || !enabled) && "opacity-70",
      )}
    >
      <div className="absolute right-3 top-3 z-[1] flex items-center gap-1.5">
        {canUninstall ? (
          <TooltipProvider delayDuration={200} skipDelayDuration={80}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onUninstall?.(skill);
                  }}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground",
                    "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                    "hover:bg-destructive/10 hover:text-destructive",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-40",
                  )}
                  aria-label={uninstallLabel}
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
        {onToggleEnabled ? (
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
              onToggleEnabled(skill, next);
            }}
          />
        ) : null}
      </div>

      <button
        type="button"
        aria-label={t("settings.skills.openDetails", {
          name: title,
          defaultValue: "Open details for {{name}}",
        })}
        onClick={() => onSelect(skill)}
        className="flex min-h-0 flex-1 flex-col gap-2 pr-16 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[12px]"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-muted/80 text-muted-foreground">
            <Brain className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold text-foreground">
              {title}
            </h3>
            <p className="mt-1 line-clamp-3 text-[12.5px] leading-5 text-muted-foreground">
              {resolveSkillDescription(skill, t, displayOpts) ||
                t("settings.skills.noDescription", { defaultValue: "No description." })}
            </p>
            {!skill.available && skill.unavailable_reason ? (
              <p className="mt-1 truncate text-[12px] leading-4 text-muted-foreground/80">
                {t("settings.skills.unavailableReason", {
                  reason: formatUnavailableReason(skill.unavailable_reason, t),
                  defaultValue: "Missing: {{reason}}",
                })}
              </p>
            ) : null}
          </div>
        </div>
      </button>
    </div>
  );
}
