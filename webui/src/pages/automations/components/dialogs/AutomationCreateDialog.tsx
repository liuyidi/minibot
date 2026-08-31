import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { bareSessionId } from "@/lib/utils/im-sessions";
import { useSessionOptions } from "@/hooks/sessions";

import {
  automationCreateDraftFromPrefill,
  automationEditDraftError,
  automationSchedulePayloadFromDraft,
  cronExprFromDailyTime,
} from "../../lib/automationDraft";
import {
  type AutomationCreateDraft,
  type AutomationEveryUnit,
  type AutomationScheduleUpdate,
} from "../../lib/automationTypes";
import { AutomationCreateTriggerPanel } from "./AutomationCreateTriggerPanel";

const selectClassName =
  "h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-colors disabled:opacity-60";

export function AutomationCreateDialog({
  open,
  prefill,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  prefill: { name?: string; message?: string } | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: {
    name: string;
    message: string;
    session_id: string;
    schedule: AutomationScheduleUpdate;
    delete_after_run?: boolean;
  }) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const [draft, setDraft] = useState<AutomationCreateDraft>(() =>
    automationCreateDraftFromPrefill(prefill),
  );
  const { sessions, loading: sessionsLoading, error: sessionsError } = useSessionOptions(open);
  const [tipVisible, setTipVisible] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(automationCreateDraftFromPrefill(prefill));
    setTipVisible(true);
    setSubmitError(null);
  }, [open, prefill]);

  useEffect(() => {
    if (!open || !sessionsLoading) return;
    setSubmitError(null);
  }, [open, sessionsLoading]);

  useEffect(() => {
    if (!open) return;
    if (sessionsError) {
      setSubmitError(sessionsError);
      return;
    }
    if (!sessions.length) return;
    setDraft((prev) => {
      if (prev.sessionId && sessions.some((row) => bareSessionId(row) === prev.sessionId)) {
        return prev;
      }
      const first = sessions[0];
      return first ? { ...prev, sessionId: bareSessionId(first) } : prev;
    });
  }, [open, prefill, sessions, sessionsError]);

  const scheduleOptions = [
    { value: "cron", label: tx("settings.automations.scheduleTypes.periodic", "Periodic") },
    { value: "every", label: tx("settings.automations.scheduleTypes.every", "Interval") },
    { value: "at", label: tx("settings.automations.scheduleTypes.at", "Once") },
  ];
  const unitLabels: Record<AutomationEveryUnit, string> = {
    second: tx("settings.automations.everyUnits.second", "Seconds"),
    minute: tx("settings.automations.everyUnits.minute", "Minutes"),
    hour: tx("settings.automations.everyUnits.hour", "Hours"),
    day: tx("settings.automations.everyUnits.day", "Days"),
  };

  const validation = (() => {
    const base = automationEditDraftError(
      draft.scheduleKind === "cron"
        ? { ...draft, cronExpr: cronExprFromDailyTime(draft.dailyTime) || "" }
        : draft,
      null,
      tx,
    );
    if (base) return base;
    if (!draft.sessionId.trim()) {
      return tx("settings.automations.validation.sessionRequired", "Select a linked chat.");
    }
    return null;
  })();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validation) return;
    const name = draft.name.trim();
    const message = draft.message.trim();
    const sessionId = draft.sessionId.trim();
    let scheduleDraft = draft;
    if (draft.scheduleKind === "cron") {
      const expr = cronExprFromDailyTime(draft.dailyTime);
      if (!expr) return;
      scheduleDraft = { ...draft, cronExpr: expr };
    }
    const schedule = automationSchedulePayloadFromDraft(scheduleDraft);
    if (typeof schedule === "string") return;
    setSubmitError(null);
    try {
      await onSave({
        name,
        message,
        session_id: sessionId,
        schedule,
        delete_after_run: schedule.kind === "at",
      });
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(92vh,44rem)] w-[min(calc(100vw-1.5rem),800px)] max-w-[800px] flex-col gap-0 overflow-visible rounded-2xl p-0"
      >
        <form
          className="flex min-h-0 max-h-[min(92vh,44rem)] flex-1 flex-col overflow-hidden"
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b border-border/40 px-6 py-4 text-left">
            <DialogTitle className="text-[17px] font-semibold">
              {tx("settings.automations.createUntitled", "New automation")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_17.5rem]">
            <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
              {tipVisible ? (
                <div className="flex items-start gap-2 rounded-xl border border-sky-200/80 bg-sky-50 px-3.5 py-3 text-[12.5px] leading-5 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-50">
                  <span className="shrink-0 font-semibold">
                    {tx("settings.automations.createTipLabel", "Tip")}
                  </span>
                  <p className="min-w-0 flex-1">
                    {tx(
                      "settings.automations.createTip",
                      "Keep the minibot client running while automations are scheduled. If the machine sleeps or the app exits, tasks will not fire on time.",
                    )}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer rounded-md p-0.5 text-sky-800/70 hover:bg-sky-100 hover:text-sky-950 dark:text-sky-100/70 dark:hover:bg-sky-500/20"
                    aria-label={tx("settings.automations.dismissTip", "Dismiss tip")}
                    onClick={() => setTipVisible(false)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ) : null}

              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.name", "Name")}
                </span>
                <Input
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="h-10 rounded-xl"
                  placeholder={tx("settings.automations.fields.namePlaceholder", "Daily AI news")}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.prompt", "Prompt")}
                </span>
                <Textarea
                  value={draft.message}
                  onChange={(event) => setDraft((prev) => ({ ...prev, message: event.target.value }))}
                  className="min-h-[180px] resize-none rounded-xl text-[13px] leading-5"
                  placeholder={tx(
                    "settings.automations.fields.promptPlaceholder",
                    "What should minibot do when this task runs?",
                  )}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.session", "Linked chat")}
                </span>
                <select
                  value={draft.sessionId}
                  disabled={sessionsLoading || !sessions.length}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, sessionId: event.target.value }))
                  }
                  className={selectClassName}
                >
                  {!sessions.length ? (
                    <option value="">
                      {sessionsLoading
                        ? tx("settings.automations.fields.sessionLoading", "Loading chats…")
                        : tx(
                            "settings.automations.fields.sessionEmpty",
                            "No chats yet — start one first",
                          )}
                    </option>
                  ) : (
                    sessions.map((session) => {
                      const id = bareSessionId(session);
                      const label =
                        session.title?.trim() || session.preview?.trim() || id;
                      return (
                        <option key={session.key} value={id}>
                          {label}
                        </option>
                      );
                    })
                  )}
                </select>
                <span className="block text-[11.5px] leading-4 text-muted-foreground">
                  {tx(
                    "settings.automations.fields.sessionHelp",
                    "Runs in this chat’s context so replies and history stay attached.",
                  )}
                </span>
              </label>
            </div>

            <AutomationCreateTriggerPanel
              draft={draft}
              setDraft={setDraft}
              scheduleOptions={scheduleOptions}
              unitLabels={unitLabels}
              tx={tx}
            />
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/40 px-6 py-3.5 sm:justify-between">
            <div className="min-w-0 flex-1 text-left text-[12px] text-destructive">
              {validation || submitError || null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
                className="h-9 rounded-xl px-4"
              >
                {tx("common.cancel", "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={Boolean(validation) || saving || sessionsLoading}
                className="h-9 rounded-xl px-4"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {tx("settings.automations.create", "Create")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
