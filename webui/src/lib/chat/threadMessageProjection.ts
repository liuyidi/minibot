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
