import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  computeLiveTurnDurationMs,
  formatTurnHeaderDuration,
  resolveTurnLatencyMs,
  resolveTurnStartedAtMs,
  turnHasExpandableActivity,
  turnIsLive,
} from "@/lib/chat/turn-timing";
import type { TurnUnit } from "@/lib/chat/activity-timeline";
import { cn } from "@/lib/utils";

export function AssistantTurnMeta({
  units,
  isStreaming,
  runStartedAt,
  expanded,
  onExpandedChange,
}: {
  units: TurnUnit[];
  isStreaming: boolean;
  runStartedAt?: number | null;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const live = turnIsLive(units, isStreaming);
  const expandable = turnHasExpandableActivity(units);
  const startedAtMs = resolveTurnStartedAtMs(units, live ? runStartedAt : null);
  const completedLatencyMs = resolveTurnLatencyMs(units);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const durationMs = live
    ? computeLiveTurnDurationMs(startedAtMs, now)
    : (completedLatencyMs ?? 0);
  const durationLabel = formatTurnHeaderDuration(durationMs, i18n.language);
  const statusLabel = live
    ? durationLabel
      ? t("message.turnStatusThinkingFor", {
          duration: durationLabel,
          defaultValue: "Thinking · {{duration}}",
        })
      : t("message.turnStatusThinking", { defaultValue: "Thinking" })
    : durationLabel
      ? t("message.turnStatusCompletedFor", {
          duration: durationLabel,
          defaultValue: "Completed · {{duration}}",
        })
      : t("message.turnStatusCompleted", { defaultValue: "Completed" });

  const subtitle = live && expandable
    ? t("message.turnStatusDeepThinking", { defaultValue: "Deep thinking" })
    : null;

  if (!live && durationMs <= 0 && !expandable) return null;

  const interactive = expandable && onExpandedChange;

  return (
    <div className="mb-1.5 flex w-full flex-col gap-0.5">
      {subtitle ? (
        <span className="text-[12px] font-medium text-muted-foreground/80">{subtitle}</span>
      ) : null}
      {interactive ? (
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          className={cn(
            "group inline-flex max-w-full items-center gap-1 rounded-md px-0.5 py-0.5 text-left",
            "text-[12.5px] font-medium text-muted-foreground/80 transition-colors hover:text-muted-foreground",
          )}
        >
          <span>{statusLabel}</span>
          <ChevronRight
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
              expanded && "rotate-90",
            )}
          />
        </button>
      ) : (
        <span className="text-[12.5px] font-medium text-muted-foreground/80">{statusLabel}</span>
      )}
    </div>
  );
}
