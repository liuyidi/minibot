import type { AutomationUpdatePayload, SessionAutomationJob } from "@/lib/types";

import {
  AUTOMATION_EVERY_UNITS,
  type AutomationCreateDraft,
  type AutomationEditDraft,
  type AutomationEveryUnit,
  type AutomationScheduleUpdate,
} from "./automationTypes";

export function automationCreateDraftFromPrefill(
  prefill: { name?: string; message?: string } | null,
): AutomationCreateDraft {
  const base = automationDraftFromJob(null);
  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      : "";
  return {
    ...base,
    name: prefill?.name?.trim() || "",
    message: prefill?.message?.trim() || "",
    scheduleKind: "cron",
    cronExpr: "0 9 * * *",
    dailyTime: "09:00",
    tz,
    sessionId: "",
  };
}

export function cronExprFromDailyTime(dailyTime: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(dailyTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${minute} ${hour} * * *`;
}

export function automationDraftFromJob(job: SessionAutomationJob | null): AutomationEditDraft {
  const every = automationIntervalDraft(job?.schedule.every_ms ?? 3_600_000);
  const scheduleKind = job?.schedule.kind === "at" || job?.schedule.kind === "cron"
    ? job.schedule.kind
    : "every";
  return {
    name: job?.name ?? "",
    message: job?.payload.message ?? "",
    scheduleKind,
    everyValue: every.value,
    everyUnit: every.unit,
    cronExpr: job?.schedule.expr ?? "0 9 * * *",
    tz: job?.schedule.tz ?? "",
    atLocal: formatLocalDateTimeInput(job?.schedule.at_ms ?? Date.now() + 3_600_000),
  };
}

export function automationIntervalDraft(ms: number): { value: string; unit: AutomationEveryUnit } {
  for (const unit of [...AUTOMATION_EVERY_UNITS].reverse()) {
    if (ms >= unit.ms && ms % unit.ms === 0) {
      return { value: String(ms / unit.ms), unit: unit.value };
    }
  }
  return { value: String(Math.max(1, Math.round(ms / 60_000))), unit: "minute" };
}

export function formatLocalDateTimeInput(ms: number): string {
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(ms - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function automationEditDraftError(
  draft: AutomationEditDraft,
  job: SessionAutomationJob | null,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): string | null {
  if (!draft.name.trim()) return tx("settings.automations.validation.nameRequired", "Name is required.");
  if (!draft.message.trim()) {
    return tx("settings.automations.validation.messageRequired", "Message is required.");
  }
  if (draft.scheduleKind === "every") {
    const value = Number(draft.everyValue);
    if (!Number.isInteger(value) || value <= 0) {
      return tx("settings.automations.validation.intervalRequired", "Interval must be a positive number.");
    }
  }
  if (draft.scheduleKind === "cron" && !draft.cronExpr.trim()) {
    return tx("settings.automations.validation.cronRequired", "Cron expression is required.");
  }
  if (draft.scheduleKind === "at") {
    const atMs = new Date(draft.atLocal).getTime();
    if (!Number.isFinite(atMs)) {
      return tx("settings.automations.validation.timeRequired", "Run time is required.");
    }
    if (atMs <= Date.now() && automationScheduleChanged(draft, job)) {
      return tx("settings.automations.validation.futureRequired", "Run time must be in the future.");
    }
  }
  return null;
}

export function automationUpdatePayloadFromDraft(
  draft: AutomationEditDraft,
  job: SessionAutomationJob | null,
): AutomationUpdatePayload | string {
  const name = draft.name.trim();
  const message = draft.message.trim();
  if (!name || !message) return "invalid";
  const payload: AutomationUpdatePayload = { name, message };
  const schedule = automationSchedulePayloadFromDraft(draft);
  if (typeof schedule === "string") return schedule;
  if (automationScheduleChanged(draft, job, schedule)) {
    payload.schedule = schedule;
  }
  return payload;
}

export function automationSchedulePayloadFromDraft(draft: AutomationEditDraft): AutomationScheduleUpdate | string {
  if (draft.scheduleKind === "every") {
    const unit = AUTOMATION_EVERY_UNITS.find((candidate) => candidate.value === draft.everyUnit);
    const value = Number(draft.everyValue);
    if (!unit || !Number.isInteger(value) || value <= 0) return "invalid";
    return { kind: "every", every_ms: value * unit.ms };
  } else if (draft.scheduleKind === "cron") {
    const expr = draft.cronExpr.trim();
    if (!expr) return "invalid";
    return { kind: "cron", expr, ...(draft.tz.trim() ? { tz: draft.tz.trim() } : {}) };
  } else {
    const atMs = new Date(draft.atLocal).getTime();
    if (!Number.isFinite(atMs)) return "invalid";
    return { kind: "at", at_ms: atMs };
  }
}

export function automationScheduleChanged(
  draft: AutomationEditDraft,
  job: SessionAutomationJob | null,
  schedule: AutomationScheduleUpdate | string = automationSchedulePayloadFromDraft(draft),
): boolean {
  if (!job || typeof schedule === "string") return true;
  if (schedule.kind !== job.schedule.kind) return true;
  if (schedule.kind === "every") return schedule.every_ms !== job.schedule.every_ms;
  if (schedule.kind === "cron") {
    return schedule.expr !== (job.schedule.expr ?? "") || (schedule.tz ?? null) !== (job.schedule.tz ?? null);
  }
  return draft.atLocal !== formatLocalDateTimeInput(job.schedule.at_ms ?? NaN);
}
