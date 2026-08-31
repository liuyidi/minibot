import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ExternalLink,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { fmtDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { SessionAutomationJob } from "@/lib/types";

import { AutomationActionGroup } from "./AutomationActions";
import type { AutomationAction } from "../../lib/automationTypes";
import {
  automationOriginLabel,
  automationStatus,
  formatAutomationNext,
  formatAutomationNextTitle,
  formatAutomationSchedule,
} from "../../lib/automationFormat";

export function AutomationDetailSheet({
  job,
  open,
  locale,
  actionKey,
  onOpenChange,
  onAction,
  onRequestEdit,
  onRequestDelete,
}: {
  job: SessionAutomationJob | null;
  open: boolean;
  locale: string;
  actionKey: string | null;
  onOpenChange: (open: boolean) => void;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => void | Promise<void>;
  onRequestEdit: (job: SessionAutomationJob) => void;
  onRequestDelete: (job: SessionAutomationJob) => void;
}) {
  const { t } = useTranslation();
  if (!job) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[min(36rem,calc(100vw-1rem))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <SheetTitle className="sr-only">
          {t("settings.automations.detailTitle", {
            defaultValue: "Automation details",
            name: job.name || job.id,
          })}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {t("settings.automations.detailDescription", {
            defaultValue: "Details for {{name}}.",
            name: job.name || job.id,
          })}
        </SheetDescription>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AutomationDetailPanel
            job={job}
            locale={locale}
            actionKey={actionKey}
            sheetLayout
            onClose={() => onOpenChange(false)}
            onAction={onAction}
            onRequestEdit={onRequestEdit}
            onRequestDelete={onRequestDelete}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AutomationDetailPanel({
  job,
  locale,
  actionKey,
  onAction,
  onRequestEdit,
  onRequestDelete,
  sheetLayout = false,
  onClose,
}: {
  job: SessionAutomationJob;
  locale: string;
  actionKey: string | null;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => void | Promise<void>;
  onRequestEdit: (job: SessionAutomationJob) => void;
  onRequestDelete: (job: SessionAutomationJob) => void;
  sheetLayout?: boolean;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const status = automationStatus(job, tx);
  const origin = automationOriginLabel(job, tx);
  const originHref = job.origin?.channel === "websocket" && job.origin.session_key
    ? `#/chat/${encodeURIComponent(job.origin.session_key)}`
    : null;
  const created = job.created_at_ms ? fmtDateTime(job.created_at_ms, locale) : null;
  const updated = job.updated_at_ms ? fmtDateTime(job.updated_at_ms, locale) : null;
  const message = job.payload.message || tx("settings.automations.systemTask", "System-managed automation");
  const schedule = formatAutomationSchedule(job, locale, tx);
  const [messageExpanded, setMessageExpanded] = useState(false);
  const messageNeedsExpansion = automationMessageNeedsExpansion(message);

  useEffect(() => {
    setMessageExpanded(false);
  }, [job.id]);

  return (
    <article className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background/42 dark:bg-background/18">
      <div className="shrink-0 border-b border-border/35 px-4 py-3.5 dark:border-white/10 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-[18px] font-medium leading-7 text-foreground">
                {job.name || job.id}
              </h3>
              <AutomationStatusBadge tone={status.tone}>{status.label}</AutomationStatusBadge>
              {job.delete_after_run ? (
                <AutomationStatusBadge>{tx("settings.automations.oneShot", "One-time")}</AutomationStatusBadge>
              ) : null}
            </div>
            <p className="mt-1 truncate text-[12.5px] leading-5 text-muted-foreground">
              {schedule} · {origin}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AutomationActionGroup
              job={job}
              actionKey={actionKey}
              onAction={onAction}
              onRequestEdit={onRequestEdit}
              onRequestDelete={onRequestDelete}
            />
            {sheetLayout && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                aria-label={tx("settings.automations.closeDetail", "Close")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_14.5rem]">
        <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <section className="rounded-[20px] border border-border/35 bg-background/62 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] dark:border-white/10 dark:bg-background/24">
            <div className="text-[11px] font-medium leading-none text-muted-foreground/75">
              {tx("settings.automations.fields.message", "Message")}
            </div>
            <div
              className={cn(
                "mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground/85",
                !messageExpanded && messageNeedsExpansion && "line-clamp-6",
              )}
            >
              {message}
            </div>
            {messageNeedsExpansion ? (
              <button
                type="button"
                className="mt-3 inline-flex text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setMessageExpanded((value) => !value)}
              >
                {messageExpanded
                  ? tx("settings.automations.message.showLess", "Show less")
                  : tx("settings.automations.message.showMore", "Show full message")}
              </button>
            ) : null}
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <AutomationDetail
              label={tx("settings.automations.labels.next", "Next")}
              title={formatAutomationNextTitle(job, locale, tx)}
            >
              {formatAutomationNext(job, tx)}
            </AutomationDetail>
            <AutomationDetail label={tx("settings.automations.labels.origin", "Linked chat")} title={origin}>
              {originHref ? (
                <a
                  className="inline-flex max-w-full items-center gap-1 text-foreground/80 underline-offset-2 hover:underline"
                  href={originHref}
                >
                  <span className="truncate">{origin}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              ) : (
                origin
              )}
            </AutomationDetail>
          </div>

          {job.state.last_error ? (
            <div className="rounded-[16px] border border-destructive/20 bg-destructive/8 px-3 py-2 text-[12px] leading-5 text-destructive">
              {job.state.last_error}
            </div>
          ) : null}
        </div>

        <aside className="min-h-0 overflow-y-auto overscroll-contain border-t border-border/35 bg-muted/20 p-4 text-[12px] text-muted-foreground dark:border-white/10 dark:bg-background/16 lg:border-l lg:border-t-0">
          <div className="grid gap-3">
            <AutomationDetail
              label={tx("settings.automations.labels.schedule", "Schedule")}
              title={schedule}
            >
              {schedule}
            </AutomationDetail>
            <div className="rounded-[18px] bg-background/55 p-3">
              <div className="grid gap-3">
                {created ? (
                  <div>
                    <div className="text-[11px] leading-none text-muted-foreground/75">
                      {tx("settings.automations.labels.created", "Created")}
                    </div>
                    <div className="mt-1.5 text-[12.5px] leading-5 text-foreground/80">{created}</div>
                  </div>
                ) : null}
                {updated ? (
                  <div>
                    <div className="text-[11px] leading-none text-muted-foreground/75">
                      {tx("settings.automations.labels.updated", "Updated")}
                    </div>
                    <div className="mt-1.5 text-[12.5px] leading-5 text-foreground/80">{updated}</div>
                  </div>
                ) : null}
                <div>
                  <div className="text-[11px] leading-none text-muted-foreground/75">ID</div>
                  <div className="mt-1.5 break-all font-mono text-[11.5px] leading-5 text-foreground/70">
                    {job.id}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}

function AutomationStatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium shadow-[inset_0_0_0_1px_rgba(120,72,25,0.055)]",
        tone === "success" &&
          "bg-orange-100/72 text-orange-800 dark:bg-orange-300/12 dark:text-orange-200",
        tone === "warning" &&
          "bg-amber-100/80 text-amber-800 dark:bg-amber-300/14 dark:text-amber-200",
        tone === "neutral" &&
          "bg-white/64 text-muted-foreground dark:bg-background/35 dark:text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function automationMessageNeedsExpansion(message: string): boolean {
  return message.length > 360 || message.split(/\r?\n/).length > 6;
}

function AutomationDetail({
  label,
  title,
  secondary,
  children,
}: {
  label: string;
  title?: string;
  secondary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[17px] bg-background/52 px-3 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.035)] dark:bg-background/22">
      <div className="text-[11px] font-medium leading-none text-muted-foreground/75">
        {label}
      </div>
      <div className="mt-1.5 min-w-0">
        <div className="line-clamp-2 text-[13px] leading-5 text-foreground/85" title={title}>
          {children}
        </div>
        {secondary ? (
          <div className="mt-0.5 truncate text-[11.5px] leading-4 text-muted-foreground" title={title}>
            {secondary}
          </div>
        ) : null}
      </div>
    </div>
  );
}
