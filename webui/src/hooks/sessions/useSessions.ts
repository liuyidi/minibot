import { useCallback, useEffect, useRef, useState } from "react";

import { useClient } from "@/providers/ClientProvider";
import i18n from "@/i18n";
import {
  ApiError,
  deleteSession as apiDeleteSession,
  fetchSessionAutomations,
  listSessions,
} from "@/lib/apis/api";
import { deriveTitle } from "@/lib/utils/format";
import type {
  ChatSummary,
  SessionAutomationJob,
  SessionDeleteResult,
  WorkspaceScopePayload,
} from "@/lib/types";
import { CHAT_CREATE_TIMEOUT_MS } from "./useSessionsHelpers";

export { useSessionHistory } from "./useSessionHistory";

/** Sidebar state: fetches the full session list and exposes create / delete actions. */
export function useSessions(): {
  sessions: ChatSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createChat: (workspaceScope?: WorkspaceScopePayload | null) => Promise<string>;
  forkChat: (sourceChatId: string, beforeUserIndex: number, title?: string) => Promise<string>;
  deleteChat: (
    key: string,
    options?: { deleteAutomations?: boolean },
  ) => Promise<SessionDeleteResult>;
  getSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
} {
  const { client, token } = useClient();
  const [sessions, setSessions] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(token);
  const optimisticKeysRef = useRef<Set<string>>(new Set());
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await listSessions(tokenRef.current);
      const serverKeys = new Set(rows.map((row) => row.key));
      setSessions((prev) => [
        ...rows,
        ...prev.filter(
          (session) =>
            optimisticKeysRef.current.has(session.key) &&
            !serverKeys.has(session.key),
        ),
      ]);
      for (const key of Array.from(optimisticKeysRef.current)) {
        if (serverKeys.has(key)) optimisticKeysRef.current.delete(key);
      }
      setError(null);
    } catch (e) {
      const msg =
        e instanceof ApiError ? `HTTP ${e.status}` : (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return client.onSessionUpdate(() => {
      void refresh();
    });
  }, [client, refresh]);

  const createChat = useCallback(async (workspaceScope?: WorkspaceScopePayload | null): Promise<string> => {
    const chatId = await client.newChat(CHAT_CREATE_TIMEOUT_MS, workspaceScope);
    const key = `websocket:${chatId}`;
    optimisticKeysRef.current.add(key);
    // Optimistic insert; a subsequent refresh will replace it with the
    // authoritative row once the server persists the session.
    setSessions((prev) => [
      {
        key,
        channel: "websocket",
        chatId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: "",
        preview: "",
        workspaceScope: workspaceScope ?? null,
      },
      ...prev.filter((s) => s.key !== key),
    ]);
    return chatId;
  }, [client]);

  const forkChat = useCallback(async (
    sourceChatId: string,
    beforeUserIndex: number,
    title?: string,
  ): Promise<string> => {
    const chatId = await client.forkChat(
      sourceChatId,
      beforeUserIndex,
      title,
      CHAT_CREATE_TIMEOUT_MS,
    );
    const key = `websocket:${chatId}`;
    optimisticKeysRef.current.add(key);
    setSessions((prev) => [
      {
        key,
        channel: "websocket",
        chatId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: title ?? "",
        preview: "",
        workspaceScope: null,
      },
      ...prev.filter((s) => s.key !== key),
    ]);
    return chatId;
  }, [client]);

  const deleteChat = useCallback(
    async (key: string, options?: { deleteAutomations?: boolean }) => {
      const result = await apiDeleteSession(tokenRef.current, key, options);
      if (!result.deleted) return result;
      optimisticKeysRef.current.delete(key);
      setSessions((prev) => prev.filter((s) => s.key !== key));
      return result;
    },
    [],
  );

  const getSessionAutomations = useCallback(async (key: string) => {
    const result = await fetchSessionAutomations(tokenRef.current, key);
    return result.jobs;
  }, []);

  return {
    sessions,
    loading,
    error,
    refresh,
    createChat,
    forkChat,
    deleteChat,
    getSessionAutomations,
  };
}

/** Produce a compact display title for a session. */
export function sessionTitle(
  session: ChatSummary,
  firstUserMessage?: string,
): string {
  return deriveTitle(
    session.title || firstUserMessage || session.preview,
    i18n.t("chat.newChat"),
  );
}
