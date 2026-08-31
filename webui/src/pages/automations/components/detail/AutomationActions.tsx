import type { ReactNode } from "react";
import {
  Loader2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionAutomationJob } from "@/lib/types";

import type { AutomationAction } from "../../lib/automationTypes";

function AppsActionButton({
  ariaLabel,
  busy,
  disabled,
  tone = "default",
  onClick,
  children,
}: {
  ariaLabel: string;
  busy?: boolean;
  disabled?: boolean;
  tone?: "default" | "installed" | "danger";
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "h-9 w-9 rounded-full text-muted-foreground transition-colors",
        tone === "installed" && "bg-transparent hover:bg-muted/70 hover:text-foreground",
        tone === "danger" && "bg-transparent hover:bg-destructive/10 hover:text-destructive",
        tone === "default" && "bg-muted/70 hover:bg-muted hover:text-foreground",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : children}
    </Button>
  );
}

export function AutomationActionGroup({
  job,
  actionKey,
  onAction,
  onRequestEdit,
  onRequestDelete,
}: {
  job: SessionAutomationJob;
  actionKey: string | null;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => void | Promise<void>;
  onRequestEdit: (job: SessionAutomationJob) => void;
  onRequestDelete: (job: SessionAutomationJob) => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const canManage = !job.protected;
  const hasLinkedChat = Boolean(job.origin);
  const canRun = canManage && hasLinkedChat && job.enabled && !job.state.pending;
  const toggleAction: AutomationAction = job.enabled ? "disable" : "enable";
  const canToggle = canManage && (job.enabled || hasLinkedChat);
  const toggleBusy = actionKey === `${toggleAction}:${job.id}`;

  if (!canManage) {
    return (
      <span className="inline-flex h-9 items-center rounded-full bg-muted px-3 text-[12px] font-medium text-muted-foreground">
        {tx("settings.automations.protected", "Protected")}
      </span>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/35 bg-background/70 p-1 shadow-[0_10px_26px_rgba(15,23,42,0.055)] dark:border-white/10 dark:bg-background/35">
      <AppsActionButton
        ariaLabel={tx("settings.automations.edit", "Edit")}
        disabled={Boolean(actionKey)}
        onClick={() => onRequestEdit(job)}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </AppsActionButton>
      <AppsActionButton
        ariaLabel={tx("settings.automations.runNow", "Run now")}
        busy={actionKey === `run:${job.id}`}
        disabled={!canRun}
        onClick={() => void onAction("run", job)}
      >
        <PlayCircle className="h-4 w-4" aria-hidden />
      </AppsActionButton>
      <AppsActionButton
        ariaLabel={
          job.enabled
            ? tx("settings.automations.pause", "Pause")
            : tx("settings.automations.resume", "Resume")
        }
        busy={toggleBusy}
        disabled={!canToggle}
        onClick={() => void onAction(toggleAction, job)}
      >
        {job.enabled ? (
          <PauseCircle className="h-4 w-4" aria-hidden />
        ) : (
          <PlayCircle className="h-4 w-4" aria-hidden />
        )}
      </AppsActionButton>
      <AppsActionButton
        ariaLabel={tx("settings.automations.delete", "Delete")}
        tone="danger"
        disabled={Boolean(actionKey)}
        onClick={() => onRequestDelete(job)}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </AppsActionButton>
    </div>
  );
}
