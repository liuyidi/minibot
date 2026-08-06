import { hasPendingAgentActivity } from "@/lib/chat/activity-timeline";
import { fetchWebuiThread } from "@/lib/apis/api";
import type { UIMessage } from "@/lib/types";

export const EMPTY_MESSAGES: UIMessage[] = [];
export const INITIAL_HISTORY_PAGE_LIMIT = 160;
export const OLDER_HISTORY_PAGE_LIMIT = 120;
export const CHAT_CREATE_TIMEOUT_MS = 60_000;

export function persistedMessagesToUi(messages: UIMessage[]): UIMessage[] {
  return messages.map((m, idx) => ({
    ...m,
    id: m.id ?? `hist-${idx}`,
    createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
  }));
}

export function hasPendingToolCallsFromThread(
  body: Awaited<ReturnType<typeof fetchWebuiThread>>,
  messages: UIMessage[],
): boolean {
  if (typeof body?.has_pending_tool_calls === "boolean") {
    return body.has_pending_tool_calls;
  }
  return hasPendingAgentActivity(messages);
}
