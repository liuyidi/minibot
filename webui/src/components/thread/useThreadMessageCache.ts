import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  isStaleThreadSnapshot,
  projectWebuiThreadMessages,
} from "@/lib/chat/threadMessageProjection";
import type { MinibotClient } from "@/lib/apis/minibot-client";
import type { UIMessage } from "@/lib/types";

export interface ThreadMessageCacheStore {
  messageCacheRef: MutableRefObject<Map<string, UIMessage[]>>;
  prevChatIdForCacheRef: MutableRefObject<string | null>;
  skipLayoutCacheRef: MutableRefObject<boolean>;
  appliedHistoryVersionRef: MutableRefObject<Map<string, number>>;
  pendingCanonicalHydrateRef: MutableRefObject<Set<string>>;
  prepareForkedChat: (forkedChatId: string) => void;
}

/** Phase 1: cache refs + stream ``initial`` (before ``useMinibotStream``). */
export function useThreadMessageCacheStore(
  chatId: string | null,
  historical: UIMessage[],
): { initial: UIMessage[]; store: ThreadMessageCacheStore } {
  const messageCacheRef = useRef<Map<string, UIMessage[]>>(new Map());
  const prevChatIdForCacheRef = useRef<string | null>(null);
  const skipLayoutCacheRef = useRef(false);
  const appliedHistoryVersionRef = useRef<Map<string, number>>(new Map());
  const pendingCanonicalHydrateRef = useRef<Set<string>>(new Set());

  const initial = useMemo(() => {
    if (!chatId) return historical;
    return messageCacheRef.current.get(chatId) ?? historical;
  }, [chatId, historical]);

  const prepareForkedChat = (forkedChatId: string) => {
    messageCacheRef.current.delete(forkedChatId);
    appliedHistoryVersionRef.current.delete(forkedChatId);
    pendingCanonicalHydrateRef.current.add(forkedChatId);
  };

  return {
    initial,
    store: {
      messageCacheRef,
      prevChatIdForCacheRef,
      skipLayoutCacheRef,
      appliedHistoryVersionRef,
      pendingCanonicalHydrateRef,
      prepareForkedChat,
    },
  };
}

/** Phase 2: hydrate / persist cache after stream ``messages`` / ``setMessages`` exist. */
export function useThreadMessageCacheSync({
  store,
  chatId,
  historyKey,
  historical,
  historyVersion,
  loading,
  messages,
  setMessages,
  client,
  refreshHistory,
}: {
  store: ThreadMessageCacheStore;
  chatId: string | null;
  historyKey: string | null;
  historical: UIMessage[];
  historyVersion: number;
  loading: boolean;
  messages: UIMessage[];
  setMessages: Dispatch<SetStateAction<UIMessage[]>>;
  client: MinibotClient;
  refreshHistory: () => void;
}) {
  const {
    messageCacheRef,
    prevChatIdForCacheRef,
    skipLayoutCacheRef,
    appliedHistoryVersionRef,
    pendingCanonicalHydrateRef,
  } = store;

  useEffect(() => {
    // sessionKey map kept for parity with prior shell behavior (debug / future use).
    void historyKey;
  }, [chatId, historyKey]);

  useEffect(() => {
    if (!chatId || loading) return;
    const cached = messageCacheRef.current.get(chatId);
    const appliedVersion = appliedHistoryVersionRef.current.get(chatId) ?? 0;
    const hasPendingCanonicalHydrate = pendingCanonicalHydrateRef.current.has(chatId);
    const hasNewCanonicalHistory = hasPendingCanonicalHydrate && historyVersion > appliedVersion;
    // When the user switches away and back, keep the local in-memory thread
    // state (including not-yet-persisted messages) instead of replacing it with
    // whatever the history endpoint currently knows about. Once a fresh
    // canonical replay arrives (e.g. after ``session_updated`` refresh), prefer it
    // so rendering converges to the same shape as a manual refresh.
    setMessages((prev) => {
      const normalizedHistory = projectWebuiThreadMessages(historical);
      const keepLiveMessages = (messagesToKeep: UIMessage[]) => {
        const projected = projectWebuiThreadMessages(messagesToKeep);
        messageCacheRef.current.set(chatId, projected);
        return projected;
      };
      if (hasNewCanonicalHistory && historical.length > 0) {
        if (isStaleThreadSnapshot(prev, normalizedHistory)) return keepLiveMessages(prev);
        pendingCanonicalHydrateRef.current.delete(chatId);
        appliedHistoryVersionRef.current.set(chatId, historyVersion);
        messageCacheRef.current.set(chatId, normalizedHistory);
        return normalizedHistory;
      }
      if (cached && cached.length > 0) {
        const normalizedCached = projectWebuiThreadMessages(cached);
        if (
          normalizedHistory.length > normalizedCached.length
          && !isStaleThreadSnapshot(prev, normalizedHistory)
        ) {
          messageCacheRef.current.set(chatId, normalizedHistory);
          appliedHistoryVersionRef.current.set(chatId, historyVersion);
          return normalizedHistory;
        }
        if (isStaleThreadSnapshot(prev, normalizedCached)) return keepLiveMessages(prev);
        return normalizedCached;
      }
      if (isStaleThreadSnapshot(prev, normalizedHistory)) return keepLiveMessages(prev);
      appliedHistoryVersionRef.current.set(chatId, historyVersion);
      if (normalizedHistory.length > 0) messageCacheRef.current.set(chatId, normalizedHistory);
      return normalizedHistory;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, chatId, historical, historyVersion]);

  useEffect(() => {
    if (!chatId) return;
    return client.onSessionUpdate((updatedChatId, scope) => {
      if (updatedChatId !== chatId) return;
      if (scope === "metadata") return;
      pendingCanonicalHydrateRef.current.add(chatId);
      refreshHistory();
    });
  }, [chatId, client, pendingCanonicalHydrateRef, refreshHistory]);

  useEffect(() => {
    if (chatId) return;
    setMessages(projectWebuiThreadMessages(historical));
  }, [chatId, historical, setMessages]);

  useLayoutEffect(() => {
    if (chatId) {
      const prev = prevChatIdForCacheRef.current;
      if (prev && prev !== chatId) {
        messageCacheRef.current.set(prev, projectWebuiThreadMessages(messages));
        skipLayoutCacheRef.current = true;
      }
      prevChatIdForCacheRef.current = chatId;
    } else {
      if (prevChatIdForCacheRef.current) {
        messageCacheRef.current.set(
          prevChatIdForCacheRef.current,
          projectWebuiThreadMessages(messages),
        );
        skipLayoutCacheRef.current = true;
      }
      prevChatIdForCacheRef.current = null;
    }
  }, [chatId, messageCacheRef, messages, prevChatIdForCacheRef, skipLayoutCacheRef]);

  // Persist thread to in-memory cache after paint so ``useMinibotStream``'s chat switch
  // ``useEffect`` reset has flushed; ``skipLayoutCacheRef`` drops the first run that still
  // sees the *previous* chat's ``messages`` (avoids stale rows leaking across sessions).
  useEffect(() => {
    if (!chatId) {
      return;
    }
    if (skipLayoutCacheRef.current) {
      skipLayoutCacheRef.current = false;
      return;
    }
    if (loading) {
      return;
    }
    messageCacheRef.current.set(chatId, projectWebuiThreadMessages(messages));
  }, [chatId, loading, messageCacheRef, messages, skipLayoutCacheRef]);
}
