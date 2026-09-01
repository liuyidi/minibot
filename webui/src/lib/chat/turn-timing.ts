import { formatTurnLatency } from "@/lib/utils/format";
import type { TurnUnit } from "@/lib/chat/activity-timeline";
import type { UIMessage } from "@/lib/types";

/** Compact seconds label for live turn headers (e.g. `12s`, `1m 5s`). */
export function formatTurnDurationCompact(ms: number): string {
  const seconds = ms > 0 && ms < 1000 ? 1 : Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function resolveTurnStartedAtMs(
  units: TurnUnit[],
  runStartedAtSec?: number | null,
): number | undefined {
  if (runStartedAtSec != null && Number.isFinite(runStartedAtSec)) {
    return Math.round(runStartedAtSec * 1000);
  }
  for (const unit of units) {
    const messages = unit.type === "activity" ? unit.messages : [unit.message];
    for (const message of messages) {
      if (Number.isFinite(message.createdAt) && message.createdAt > 1_000_000_000_000) {
        return message.createdAt;
      }
    }
  }
  return undefined;
}

export function resolveTurnLatencyMs(units: TurnUnit[]): number | undefined {
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const unit = units[i];
    if (unit.type === "activity" && unit.turnLatencyMs != null && unit.turnLatencyMs >= 0) {
      return unit.turnLatencyMs;
    }
    if (unit.type === "message" && unit.message.latencyMs != null && unit.message.latencyMs >= 0) {
      return unit.message.latencyMs;
    }
  }
  return undefined;
}

export function turnHasExpandableActivity(units: TurnUnit[]): boolean {
  return units.some((unit) => unit.type === "activity" && unit.messages.length > 0);
}

export function turnIsLive(units: TurnUnit[], isStreaming: boolean): boolean {
  if (!isStreaming) return false;
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const unit = units[i];
    if (unit.type === "message") {
      if (unit.message.role === "assistant" && unit.message.isStreaming) return true;
      if (unit.message.role === "assistant" && !unit.message.isStreaming) return false;
      continue;
    }
    if (unit.messages.some((message) => message.isStreaming || message.reasoningStreaming)) {
      return true;
    }
  }
  return isStreaming;
}

export function computeLiveTurnDurationMs(
  startedAtMs: number | undefined,
  now: number,
): number {
  if (startedAtMs == null) return 0;
  return Math.max(0, now - startedAtMs);
}

export function formatTurnHeaderDuration(ms: number, locale?: string): string {
  if (ms <= 0) return "";
  if (ms >= 1000) return formatTurnLatency(ms, locale);
  return formatTurnDurationCompact(ms);
}

export function firstAssistantMessage(units: TurnUnit[]): UIMessage | undefined {
  for (const unit of units) {
    if (unit.type === "message" && unit.message.role === "assistant") {
      return unit.message;
    }
  }
  return undefined;
}
