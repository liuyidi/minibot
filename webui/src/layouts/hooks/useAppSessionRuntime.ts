import { useCallback, useEffect, useMemo, useRef } from "react";

import { RESTART_STARTED_KEY } from "@/layouts/constants";
import { useDeferredTitleRefresh } from "@/hooks/useDeferredTitleRefresh";
import type { ChatSummary } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";
import { useSessionUiStore, useUiStore } from "@/stores";

export function useAppSessionRuntime({
  loading,
  sessions,
  activeSession,
  activeChatId,
  onModelNameChange,
  t,
  refresh,
}: {
  loading: boolean;
  sessions: ChatSummary[];
  activeSession: ChatSummary | null;
  activeChatId: string | null;
  onModelNameChange: (modelName: string | null) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  refresh: () => Promise<void>;
}) {
  const { client } = useClient();
  const restartSawDisconnectRef = useRef(false);
  const activeChatIdRef = useRef<string | null>(null);

  const runningChatIds = useSessionUiStore((s) => s.runningChatIds);
  const updatedChatIds = useSessionUiStore((s) => s.updatedChatIds);
  const updateRunningChatIds = useSessionUiStore((s) => s.updateRunningChatIds);
  const updateUpdatedChatIds = useSessionUiStore((s) => s.updateUpdatedChatIds);
  const hydrateSessionUiFromStorage = useSessionUiStore((s) => s.hydrateFromStorage);

  const setRestartToast = useUiStore((s) => s.setRestartToast);
  const setIsRestarting = useUiStore((s) => s.setIsRestarting);
  const isRestarting = useUiStore((s) => s.isRestarting);
  const restartToast = useUiStore((s) => s.restartToast);

  useEffect(() => {
    hydrateSessionUiFromStorage();
  }, [hydrateSessionUiFromStorage]);

  const runningChatIdList = useMemo(() => Array.from(runningChatIds), [runningChatIds]);
  const updatedChatIdList = useMemo(() => Array.from(updatedChatIds), [updatedChatIds]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    if (!activeChatId) return;
    updateUpdatedChatIds((current) => {
      if (!current.has(activeChatId)) return current;
      const next = new Set(current);
      next.delete(activeChatId);
      return next;
    });
  }, [activeChatId, updateUpdatedChatIds]);

  useEffect(() => {
    return client.onSessionUpdate((chatId, scope) => {
      if (scope !== "thread") return;
      updateUpdatedChatIds((current) => {
        const next = new Set(current);
        if (activeChatIdRef.current === chatId) {
          next.delete(chatId);
        } else {
          next.add(chatId);
        }
        return next.size === current.size && next.has(chatId) === current.has(chatId)
          ? current
          : next;
      });
    });
  }, [client, updateUpdatedChatIds]);

  useEffect(() => {
    if (loading) return;
    const activeRunIds = sessions
      .filter((session) => typeof session.runStartedAt === "number")
      .map((session) => session.chatId);
    if (activeRunIds.length === 0) return;

    for (const chatId of activeRunIds) {
      client.attach(chatId);
    }
    updateRunningChatIds((current) => {
      let changed = false;
      const next = new Set(current);
      for (const chatId of activeRunIds) {
        if (!next.has(chatId)) changed = true;
        next.add(chatId);
      }
      if (!changed) return current;
      return next;
    });
    updateUpdatedChatIds((current) => {
      let changed = false;
      const next = new Set(current);
      for (const chatId of activeRunIds) {
        if (next.delete(chatId)) changed = true;
      }
      return changed ? next : current;
    });
  }, [client, loading, sessions, updateRunningChatIds, updateUpdatedChatIds]);

  useEffect(() => {
    return client.onRuntimeModelUpdate((modelName) => {
      onModelNameChange(modelName);
    });
  }, [client, onModelNameChange]);

  useEffect(() => {
    return client.onRunStatus((chatId, startedAt) => {
      if (startedAt != null) {
        updateRunningChatIds((current) => {
          const next = new Set(current);
          next.add(chatId);
          return next;
        });
        updateUpdatedChatIds((current) => {
          if (!current.has(chatId)) return current;
          const next = new Set(current);
          next.delete(chatId);
          return next;
        });
        return;
      }

      const running = useSessionUiStore.getState().runningChatIds;
      if (!running.has(chatId)) return;
      updateRunningChatIds((current) => {
        const next = new Set(current);
        next.delete(chatId);
        return next;
      });
      updateUpdatedChatIds((current) => {
        const next = new Set(current);
        if (activeChatIdRef.current === chatId) {
          next.delete(chatId);
        } else {
          next.add(chatId);
        }
        return next;
      });
    });
  }, [client, updateRunningChatIds, updateUpdatedChatIds]);

  useEffect(() => {
    return client.onStatus((status) => {
      const startedAt = Number(
        window.localStorage.getItem(RESTART_STARTED_KEY) ?? "0",
      );
      if (!startedAt) return;
      if (status !== "open") {
        restartSawDisconnectRef.current = true;
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      if (!restartSawDisconnectRef.current && elapsedMs < 1500) return;
      window.localStorage.removeItem(RESTART_STARTED_KEY);
      setIsRestarting(false);
      setRestartToast(t("app.restart.completed", { seconds: (elapsedMs / 1000).toFixed(1) }));
      window.setTimeout(() => setRestartToast(null), 3_500);
    });
  }, [client, setIsRestarting, setRestartToast, t]);

  const onRestart = useCallback(() => {
    const chatId = activeSession?.chatId ?? client.defaultChatId;
    if (!chatId) return;
    restartSawDisconnectRef.current = false;
    setIsRestarting(true);
    window.localStorage.setItem(RESTART_STARTED_KEY, String(Date.now()));
    client.sendMessage(chatId, "/restart");
  }, [activeSession?.chatId, client, setIsRestarting]);

  const onTurnEnd = useDeferredTitleRefresh(activeSession, refresh);
  const activeChatRunning = activeChatId ? runningChatIds.has(activeChatId) : false;

  return {
    runningChatIdList,
    updatedChatIdList,
    updateUpdatedChatIds,
    activeChatRunning,
    onRestart,
    onTurnEnd,
    isRestarting,
    restartToast,
  };
}
