import type { UIMessage } from "@/lib/types";
import { normalizeLegacyLongTaskMessages } from "@/lib/chat/thread-display-compat";
import { scrubSubagentUiMessages } from "@/lib/chat/subagent-channel-display";

export function projectWebuiThreadMessages(messages: UIMessage[]): UIMessage[] {
  return scrubSubagentUiMessages(normalizeLegacyLongTaskMessages(messages));
}

function sameMessageShape(a: UIMessage, b: UIMessage): boolean {
  return (
    a.role === b.role
    && (a.kind ?? "") === (b.kind ?? "")
    && a.content === b.content
  );
}

/** True when ``snapshot`` looks like a truncated prefix of live ``current``. */
export function isStaleThreadSnapshot(current: UIMessage[], snapshot: UIMessage[]): boolean {
  if (current.length === 0 || snapshot.length >= current.length) return false;
  if (snapshot.length === 0) return true;
  return snapshot.every((message, index) => sameMessageShape(current[index], message));
}

/** Copy runtime-only fields (e.g. Langfuse trace ids) from live rows onto history. */
export function mergeLiveMessageRuntimeFields(
  live: UIMessage[],
  history: UIMessage[],
): UIMessage[] {
  if (live.length === 0 || history.length === 0) return history;
  const liveByShape = new Map<string, string>();
  for (const message of live) {
    if (message.role !== "assistant" || !message.langfuseTraceId) continue;
    const key = `${message.kind ?? ""}::${message.content}`;
    if (!liveByShape.has(key)) liveByShape.set(key, message.langfuseTraceId);
  }
  if (liveByShape.size === 0) return history;
  return history.map((message) => {
    if (message.role !== "assistant" || message.langfuseTraceId) return message;
    const key = `${message.kind ?? ""}::${message.content}`;
    const traceId = liveByShape.get(key);
    return traceId ? { ...message, langfuseTraceId: traceId } : message;
  });
}
