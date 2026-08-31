import {
  Loader2,
  MoreHorizontal,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleButton } from "@/components/settings/controls";
import { cn } from "@/lib/utils";
import type { SessionAutomationJob } from "@/lib/types";

import type { AutomationAction } from "../../lib/automationTypes";
import {
  formatAutomationNext,
  formatAutomationNextTitle,
  formatAutomationSchedule,
  automationStatusDotClass,
} from "../../lib/automationFormat";

export function AutomationListItem({
  job,
  locale,
  actionKey,
  bordered,
  onAction,
  onRequestEdit,
  onRequestDelete,
}: {
  job: SessionAutomationJob;
  locale: string;
  actionKey: string | null;
  bordered: boolean;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => void | Promise<void>;
  onRequestEdit: (job: SessionAutomationJob) => void;
  onRequestDelete: (job: SessionAutomationJob) => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const schedule = formatAutomationSchedule(job, locale, tx);
  const nextRun = formatAutomationNext(job, tx);
  const hasLinkedChat = Boolean(job.origin);
  const canRun = hasLinkedChat && job.enabled && !job.state.pending;
  const toggleAction: AutomationAction = job.enabled ? "disable" : "enable";
  const canToggle = job.enabled || hasLinkedChat;
  const toggleBusy = actionKey === `${toggleAction}:${job.id}`;
  const menuBusy = Boolean(actionKey);

  return (
    <div
      role="listitem"
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35",
        bordered && "border-t border-border/35",
      )}
    >
      <button
        type="button"
        onClick={() => onRequestEdit(job)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", automationStatusDotClass(job))}
            aria-hidden
          />
          <span className="truncate text-[14px] font-medium text-foreground">
            {job.name || job.id}
          </span>
          {job.delete_after_run ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {tx("settings.automations.oneShot", "One-time")}
            </span>
          ) : null}
        </span>
        <span
          className="mt-1 block truncate pl-4 text-[12px] text-muted-foreground"
          title={formatAutomationNextTitle(job, locale, tx)}
        >
          {schedule}
          <span className="mx-1.5 text-muted-foreground/45">·</span>
          {nextRun}
        </span>
      </button>

      <div
        className="flex shrink-0 items-center gap-1.5"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <ToggleButton
          checked={job.enabled}
          disabled={!canToggle || toggleBusy}
          onChange={(checked) => {
            if (checked === job.enabled) return;
            void onAction(checked ? "enable" : "disable", job);
          }}
          label={
            job.enabled
              ? tx("settings.automations.pause", "Pause")
              : tx("settings.automations.resume", "Resume")
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={menuBusy}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-50"
              aria-label={tx("settings.automations.moreActions", "More actions")}
            >
              {actionKey?.endsWith(`:${job.id}`) ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem
              disabled={!canRun || menuBusy}
              onClick={() => void onAction("run", job)}
            >
              <PlayCircle className="mr-2 h-4 w-4" aria-hidden />
              {tx("settings.automations.runNow", "Run now")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={menuBusy}
              onClick={() => onRequestDelete(job)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              {tx("settings.automations.delete", "Delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
