import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageBubble } from "./MessageBubble";
import { AssistantTurnMeta } from "./AssistantTurnMeta";
import { AgentActivityCluster } from "@/components/thread/activity/AgentActivityCluster";
import { groupUnitsIntoRenderBlocks } from "@/lib/chat/assistant-turn-blocks";
import { turnIsLive } from "@/lib/chat/turn-timing";
import { normalizeActivityTimeline, type TurnUnit } from "@/lib/chat/activity-timeline";
import type { CliAppInfo, McpPresetInfo, UIMessage } from "@/lib/types";

interface ThreadMessagesProps {
  messages: UIMessage[];
  /** When true, agent turn still in flight — keeps activity timeline expanded. */
  isStreaming?: boolean;
  /** Unix epoch seconds for the active user turn (live duration). */
  runStartedAt?: number | null;
  hiddenUserMessageCount?: number;
  cliApps?: CliAppInfo[];
  mcpPresets?: McpPresetInfo[];
  forkBoundaryMessageCount?: number | null;
  onOpenFilePreview?: (path: string) => void;
  onForkFromMessage?: (beforeUserIndex: number) => void;
  /** Enables latest-trace fallback for the newest completed assistant response. */
  feedbackEnabled?: boolean;
  feedbackByMessageId?: Record<string, boolean>;
  onAssistantFeedback?: (message: UIMessage, helpful: boolean) => Promise<void>;
}

export type DisplayUnit = TurnUnit;

/** True when this unit index is the last assistant text slice before the next user message (or end of thread). */
export function isFinalAssistantSliceBeforeNextUser(
  units: DisplayUnit[],
  index: number,
): boolean {
  const u = units[index];
  if (u.type !== "message" || u.message.role !== "assistant") return true;
  for (let j = index + 1; j < units.length; j++) {
    const v = units[j];
    if (v.type === "message" && v.message.role === "user") break;
    return false;
  }
  return true;
}

export function buildDisplayUnits(
  messages: UIMessage[],
  isStreaming = false,
): DisplayUnit[] {
  return normalizeActivityTimeline(messages, {
    preserveTrailingActivity: isStreaming,
  });
}

export function assistantCopyFlags(units: DisplayUnit[]): boolean[] {
  const flags = new Array<boolean>(units.length).fill(true);
  let hasLaterUnitBeforeUser = false;
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const unit = units[i];
    if (unit.type === "message" && unit.message.role === "user") {
      hasLaterUnitBeforeUser = false;
      continue;
    }
    if (unit.type === "message" && unit.message.role === "assistant") {
      flags[i] = !hasLaterUnitBeforeUser;
    }
    hasLaterUnitBeforeUser = true;
  }
  return flags;
}

export function ThreadMessages({
  messages,
  isStreaming = false,
  runStartedAt = null,
  hiddenUserMessageCount = 0,
  cliApps = [],
  mcpPresets = [],
  forkBoundaryMessageCount = null,
  onOpenFilePreview,
  onForkFromMessage,
  feedbackEnabled = false,
  feedbackByMessageId = {},
  onAssistantFeedback,
}: ThreadMessagesProps) {
  const { t } = useTranslation();
  const units = useMemo(() => buildDisplayUnits(messages, isStreaming), [isStreaming, messages]);
  const blocks = useMemo(() => groupUnitsIntoRenderBlocks(units), [units]);
  const forkBoundaryAfterUnitIndex = useMemo(
    () => unitIndexAfterMessageCount(units, forkBoundaryMessageCount),
    [forkBoundaryMessageCount, units],
  );
  const copyFlags = useMemo(() => assistantCopyFlags(units), [units]);
  const latestAssistantMessageId = useMemo(() => {
    for (let i = units.length - 1; i >= 0; i -= 1) {
      const unit = units[i];
      if (unit.type === "message" && unit.message.role === "assistant" && !unit.message.isStreaming) {
        return unit.message.id;
      }
    }
    return null;
  }, [units]);
  const liveActivityClusterIndices = useMemo(
    () => isStreaming ? currentActivityClusterIndices(units) : new Set<number>(),
    [isStreaming, units],
  );
  const [expandedTurnIds, setExpandedTurnIds] = useState<Record<string, boolean>>({});
  let nextUserIndex = hiddenUserMessageCount;

  return (
    <div className="flex w-full flex-col">
      {blocks.map((block) => {
        if (block.kind === "user") {
          const { message, index } = block;
          const prev = units[index - 1];
          const marginTop = index > 0 ? marginAfterPrevUnit(prev) : "";
          nextUserIndex += 1;
          return (
            <Fragment key={message.message.id}>
              <div className={marginTop} data-user-prompt-id={message.message.id}>
                <MessageBubble message={message.message} />
              </div>
              {index === forkBoundaryAfterUnitIndex ? (
                <ForkBoundaryDivider label={t("thread.forkedFromHistory")} />
              ) : null}
            </Fragment>
          );
        }

        const turnUnits = block.units.map(({ unit }) => unit);
        const live = turnIsLive(turnUnits, isStreaming);
        const expanded = expandedTurnIds[block.blockId] ?? live;
        const setExpanded = (open: boolean) => {
          setExpandedTurnIds((current) => ({ ...current, [block.blockId]: open }));
        };
        const firstIndex = block.units[0]?.index ?? 0;
        const prev = units[firstIndex - 1];
        const marginTop = firstIndex > 0 ? marginAfterPrevUnit(prev) : "";

        return (
          <Fragment key={block.blockId}>
            <div className={marginTop}>
              <AssistantTurnMeta
                units={turnUnits}
                isStreaming={isStreaming}
                runStartedAt={runStartedAt}
                expanded={expanded}
                onExpandedChange={setExpanded}
              />
              {block.units.map(({ unit, index }, turnUnitIndex) => {
                const next = units[index + 1];
                const hasBodyBelow =
                  unit.type === "activity"
                  && next?.type === "message"
                  && next.message.role === "assistant";
                const forkIndex =
                  unit.type === "message" && unit.message.role === "assistant" && copyFlags[index]
                    ? nextUserIndex
                    : undefined;

                return (
                  <Fragment key={unitKey(unit, index)}>
                    <div className={turnUnitIndex > 0 ? marginAfterPrevUnit(block.units[turnUnitIndex - 1]?.unit) : undefined}>
                      {unit.type === "activity" ? (
                        <AgentActivityCluster
                          messages={unit.messages}
                          isTurnStreaming={liveActivityClusterIndices.has(index)}
                          hasBodyBelow={hasBodyBelow}
                          turnLatencyMs={unit.turnLatencyMs}
                          cliApps={cliApps}
                          mcpPresets={mcpPresets}
                          onOpenFilePreview={onOpenFilePreview}
                          suppressTurnDuration
                          expanded={expanded}
                          onExpandedChange={setExpanded}
                        />
                      ) : (
                        <MessageBubble
                          message={unit.message}
                          showAssistantCopyAction={copyFlags[index]}
                          cliApps={cliApps}
                          mcpPresets={mcpPresets}
                          onOpenFilePreview={onOpenFilePreview}
                          onForkFromHere={
                            onForkFromMessage && forkIndex !== undefined
                              ? () => onForkFromMessage(forkIndex)
                              : undefined
                          }
                          allowLatestTraceFeedback={
                            feedbackEnabled && unit.message.id === latestAssistantMessageId
                          }
                          initialFeedback={feedbackByMessageId[unit.message.id] ?? null}
                          onAssistantFeedback={feedbackEnabled ? onAssistantFeedback : undefined}
                        />
                      )}
                    </div>
                    {index === forkBoundaryAfterUnitIndex ? (
                      <ForkBoundaryDivider label={t("thread.forkedFromHistory")} />
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function unitIndexAfterMessageCount(
  units: DisplayUnit[],
  messageCount: number | null | undefined,
): number | null {
  if (messageCount == null || messageCount <= 0) return null;
  let seen = 0;
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    seen += unit.type === "activity" ? unit.messages.length : 1;
    if (seen >= messageCount) return i;
  }
  return null;
}

function ForkBoundaryDivider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] text-muted-foreground/80">
      <span aria-hidden className="h-px flex-1 bg-border/70" />
      <span className="shrink-0">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-border/70" />
    </div>
  );
}

function currentActivityClusterIndices(units: DisplayUnit[]): Set<number> {
  const indices = new Set<number>();
  let markedCurrentActivity = false;
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const unit = units[i];
    if (unit.type === "activity") {
      if (!markedCurrentActivity) {
        indices.add(i);
        markedCurrentActivity = true;
      }
      continue;
    }
    if (unit.message.role === "assistant" && unit.message.isStreaming) continue;
    if (unit.message.role === "user") break;
  }
  return indices;
}

function unitKey(unit: DisplayUnit, index: number): string {
  if (unit.type === "activity") {
    const anchor = unit.messages[0]?.id;
    return anchor != null ? `activity-${anchor}` : `activity-idx-${index}`;
  }
  return unit.message.id;
}

function marginAfterPrevUnit(prev: DisplayUnit | undefined): string {
  if (!prev) return "mt-4";
  if (prev.type === "activity") {
    return "mt-4";
  }
  const p = prev.message;
  const denseP =
    p.kind === "trace"
    || (
      p.role === "assistant"
      && p.content.trim().length === 0
      && (!!p.reasoning || !!p.reasoningStreaming)
    );
  if (denseP) {
    return "mt-2";
  }
  return "mt-5";
}
