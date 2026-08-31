/** Adapted from @minikb/ui picker helpers. */

import { pad2 } from "@/lib/picker/timeSegments";

export function parseTimeString(value: string | null | undefined): { hours: number; minutes: number } {
  if (!value) return { hours: 0, minutes: 0 };
  const [hh, mm] = value.split(":");
  return {
    hours: parseInt(hh ?? "0", 10) || 0,
    minutes: parseInt(mm ?? "0", 10) || 0,
  };
}

export function normalizeTimeString(value: string): string {
  const { hours, minutes } = parseTimeString(value);
  const h = Math.min(23, Math.max(0, hours));
  const m = Math.min(59, Math.max(0, minutes));
  return `${pad2(h)}:${pad2(m)}`;
}

export function formatDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function timeStringFromDate(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDateTimeValue(date: Date): string {
  return `${formatDateValue(date)} ${timeStringFromDate(date)}`;
}

export function applyDateToDateTime(
  base: Date | null,
  selectedDate: Date,
  fallbackTime = "00:00",
): Date {
  const time = base ? timeStringFromDate(base) : fallbackTime;
  const { hours, minutes } = parseTimeString(time);
  const next = new Date(selectedDate);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function applyTimeToDateTime(base: Date | null, time: string): Date {
  const normalized = normalizeTimeString(time);
  const { hours, minutes } = parseTimeString(normalized);
  const next = base ? new Date(base) : new Date();
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function defaultDraftTime(value: string | null): string {
  if (value) return value;
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

export function dateFromLocalInput(value: string): Date | null {
  if (!value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export function localInputFromDate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export const pickerTriggerClassName =
  "inline-flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-[12px] border border-input bg-background px-3 text-sm font-normal transition-colors hover:bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
