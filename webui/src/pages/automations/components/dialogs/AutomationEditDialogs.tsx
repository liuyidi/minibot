import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/settings/controls";
import {
  dateFromLocalInput,
  localInputFromDate,
} from "@/lib/picker/pickerUtils";
import type { AutomationUpdatePayload, SessionAutomationJob } from "@/lib/types";

import {
  automationDraftFromJob,
  automationEditDraftError,
  automationUpdatePayloadFromDraft,
} from "../../lib/automationDraft";
import {
  automationOriginLabel,
  formatAutomationNext,
  formatAutomationNextTitle,
} from "../../lib/automationFormat";
import {
  AUTOMATION_EVERY_UNITS,
  type AutomationEditDraft,
  type AutomationEveryUnit,
} from "../../lib/automationTypes";

export function AutomationEditDialog({
  job,
  saving,
  onOpenChange,
  onSave,
}: {
  job: SessionAutomationJob | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (job: SessionAutomationJob, values: AutomationUpdatePayload) => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const locale = i18n.resolvedLanguage || i18n.language;
  const [draft, setDraft] = useState<AutomationEditDraft>(() => automationDraftFromJob(null));

  useEffect(() => {
    setDraft(automationDraftFromJob(job));
  }, [job]);

  const validation = automationEditDraftError(draft, job, tx);
  const scheduleOptions = [
    { value: "every", label: tx("settings.automations.scheduleTypes.every", "Interval") },
    { value: "cron", label: tx("settings.automations.scheduleTypes.cron", "Cron") },
    { value: "at", label: tx("settings.automations.scheduleTypes.at", "Once") },
  ];
  const unitLabels: Record<AutomationEveryUnit, string> = {
    second: tx("settings.automations.everyUnits.second", "Seconds"),
    minute: tx("settings.automations.everyUnits.minute", "Minutes"),
    hour: tx("settings.automations.everyUnits.hour", "Hours"),
    day: tx("settings.automations.everyUnits.day", "Days"),
  };
  const origin = job ? automationOriginLabel(job, tx) : "";
  const nextRun = job ? formatAutomationNext(job, tx) : "";
  const originHref =
    job?.origin?.channel === "websocket" && job.origin.session_key
      ? `#/chat/${encodeURIComponent(job.origin.session_key)}`
      : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = automationUpdatePayloadFromDraft(draft, job);
    if (!job || typeof payload === "string") return;
    void onSave(job, payload);
  };

  return (
    <Dialog open={Boolean(job)} onOpenChange={onOpenChange}>
      {job ? (
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[min(92vh,40rem)] w-[min(calc(100vw-2rem),34rem)] flex-col gap-0 overflow-visible rounded-[26px] p-0"
        >
          <form className="flex min-h-0 max-h-[min(92vh,40rem)] flex-1 flex-col overflow-hidden" onSubmit={submit}>
            <DialogHeader className="shrink-0 border-b border-border/40 px-5 py-4 text-left">
              <DialogTitle>{tx("settings.automations.editTitle", "Edit automation")}</DialogTitle>
              <div className="mt-2 grid gap-1.5 text-[12px] leading-5 text-muted-foreground">
                <div>
                  <span className="text-muted-foreground/75">
                    {tx("settings.automations.labels.next", "Next")}
                  </span>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span title={formatAutomationNextTitle(job, locale, tx)}>{nextRun}</span>
                </div>
                <div className="min-w-0 truncate">
                  <span className="text-muted-foreground/75">
                    {tx("settings.automations.labels.origin", "Linked chat")}
                  </span>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  {originHref ? (
                    <a
                      className="text-foreground/80 underline-offset-2 hover:underline"
                      href={originHref}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {origin}
                    </a>
                  ) : (
                    origin
                  )}
                </div>
                <div className="min-w-0 truncate font-mono text-[11px]">
                  ID · {job.id}
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.name", "Name")}
                </span>
                <Input
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="h-10 rounded-[12px]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.message", "Message")}
                </span>
                <Textarea
                  value={draft.message}
                  onChange={(event) => setDraft((prev) => ({ ...prev, message: event.target.value }))}
                  className="min-h-[160px] resize-none rounded-[12px] text-[13px] leading-5"
                />
              </label>

              <div className="space-y-2">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.scheduleType", "Schedule type")}
                </span>
                <SegmentedControl
                  value={draft.scheduleKind}
                  options={scheduleOptions}
                  onChange={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      scheduleKind: value as AutomationEditDraft["scheduleKind"],
                    }))
                  }
                />
              </div>

              {draft.scheduleKind === "every" ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {tx("settings.automations.fields.every", "Every")}
                    </span>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={draft.everyValue}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, everyValue: event.target.value }))
                      }
                      className="h-10 rounded-[12px]"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {tx("settings.automations.fields.unit", "Unit")}
                    </span>
                    <select
                      value={draft.everyUnit}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          everyUnit: event.target.value as AutomationEveryUnit,
                        }))
                      }
                      className="h-10 w-full rounded-[12px] border border-input bg-background px-3 text-[13px] text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {AUTOMATION_EVERY_UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unitLabels[unit.value]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {draft.scheduleKind === "cron" ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {tx("settings.automations.fields.cronExpression", "Cron expression")}
                    </span>
                    <Input
                      value={draft.cronExpr}
                      onChange={(event) => setDraft((prev) => ({ ...prev, cronExpr: event.target.value }))}
                      placeholder="0 9 * * *"
                      className="h-10 rounded-[12px] font-mono text-[13px]"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {tx("settings.automations.fields.timezone", "Timezone")}
                    </span>
                    <Input
                      value={draft.tz}
                      onChange={(event) => setDraft((prev) => ({ ...prev, tz: event.target.value }))}
                      placeholder="Asia/Shanghai"
                      className="h-10 rounded-[12px] text-[13px]"
                    />
                  </label>
                </div>
              ) : null}

              {draft.scheduleKind === "at" ? (
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {tx("settings.automations.fields.runAt", "Run at")}
                  </span>
                  <DateTimePicker
                    value={dateFromLocalInput(draft.atLocal)}
                    onChange={(next) =>
                      setDraft((prev) => ({
                        ...prev,
                        atLocal: next ? localInputFromDate(next) : "",
                      }))
                    }
                    placeholder={tx(
                      "settings.automations.fields.runAtPlaceholder",
                      "Select date and time",
                    )}
                    aria-label={tx("settings.automations.fields.runAt", "Run at")}
                  />
                </label>
              ) : null}

              {validation ? (
                <div className="rounded-[12px] bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
                  {validation}
                </div>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 border-t border-border/40 px-5 py-3.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="rounded-full"
              >
                {tx("settings.automations.cancel", "Cancel")}
              </Button>
              <Button type="submit" disabled={Boolean(validation) || saving} className="rounded-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {tx("settings.automations.save", "Save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function AutomationDeleteDialog({
  job,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  job: SessionAutomationJob | null;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (job: SessionAutomationJob) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  return (
    <Dialog open={Boolean(job)} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100vw-2rem),26rem)] rounded-[26px]">
        <DialogHeader>
          <DialogTitle>{tx("settings.automations.deleteTitle", "Delete automation")}</DialogTitle>
          <DialogDescription>
            {tx(
              "settings.automations.deleteDescription",
              "This removes {{name}} from the cron store. Past chat messages stay in the session.",
              { name: job?.name || job?.id || "" },
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className="rounded-full"
          >
            {tx("settings.automations.cancel", "Cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => job && void onConfirm(job)}
            disabled={!job || deleting}
            className="rounded-full"
          >
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            {tx("settings.automations.delete", "Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
