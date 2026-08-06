import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  fetchWebuiThread,
} from "@/lib/apis/api";
import { hasPendingAgentActivity } from "@/lib/chat/activity-timeline";
import type { UIMessage } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";
import {
  EMPTY_MESSAGES,
  INITIAL_HISTORY_PAGE_LIMIT,
  OLDER_HISTORY_PAGE_LIMIT,
  hasPendingToolCallsFromThread,
  persistedMessagesToUi,
} from "./useSessionsHelpers";

/** Lazy-load a session's on-disk messages the first time the UI displays it. */
export function useSessionHistory(key: string | null): {
  messages: UIMessage[];
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  refresh: () => void;
  loadOlder: () => Promise<void>;
  hasMoreBefore: boolean;
  userMessageOffset: number;
  version: number;
  forkBoundaryMessageCount: number | null;
  /** ``true`` when the replayed transcript ends with a trace row (turn still in flight). */
  hasPendingToolCalls: boolean;
} {
  const { token } = useClient();
  const loadingOlderRef = useRef(false);
  const [refreshSeq, setRefreshSeq] = useState(0);
  const refresh = useCallback(() => {
    setRefreshSeq((value) => value + 1);
  }, []);
  const [state, setState] = useState<{
    key: string | null;
    messages: UIMessage[];
    loading: boolean;
    loadingOlder: boolean;
    error: string | null;
    hasPendingToolCalls: boolean;
    forkBoundaryMessageCount: number | null;
    beforeCursor: string | null;
    hasMoreBefore: boolean;
    userMessageOffset: number;
    version: number;
  }>({
    key: null,
    messages: [],
    loading: false,
    loadingOlder: false,
    error: null,
    hasPendingToolCalls: false,
    forkBoundaryMessageCount: null,
    beforeCursor: null,
    hasMoreBefore: false,
    userMessageOffset: 0,
    version: 0,
  });

  useEffect(() => {
    if (!key) {
      setState({
        key: null,
        messages: [],
        loading: false,
        loadingOlder: false,
        error: null,
        hasPendingToolCalls: false,
        forkBoundaryMessageCount: null,
        beforeCursor: null,
        hasMoreBefore: false,
        userMessageOffset: 0,
        version: 0,
      });
      return;
    }
    let cancelled = false;
    // Mark the new key as loading immediately so callers never see stale
    // messages from the previous session during the render right after a switch.
    setState((prev) =>
      prev.key === key
        ? { ...prev, loading: true, loadingOlder: false, error: null }
        : {
            key,
            messages: [],
            loading: true,
            loadingOlder: false,
            error: null,
            hasPendingToolCalls: false,
            forkBoundaryMessageCount: null,
            beforeCursor: null,
            hasMoreBefore: false,
            userMessageOffset: 0,
            version: 0,
          },
    );
    (async () => {
      try {
        const body = await fetchWebuiThread(token, key, {
          limit: INITIAL_HISTORY_PAGE_LIMIT,
          direction: "latest",
        });
        if (cancelled) return;
        if (!body?.messages?.length) {
          setState((prev) => ({
            key,
            messages: [],
            loading: false,
            loadingOlder: false,
            error: null,
            hasPendingToolCalls: false,
            forkBoundaryMessageCount: null,
            beforeCursor: null,
            hasMoreBefore: false,
            userMessageOffset: 0,
            version: prev.key === key ? prev.version + 1 : 1,
          }));
          return;
        }
        const ui = persistedMessagesToUi(body.messages);
        const hasPending = hasPendingToolCallsFromThread(body, ui);
        const forkBoundary =
          typeof body.fork_boundary_message_count === "number"
            ? Math.max(0, Math.min(body.fork_boundary_message_count, ui.length))
            : null;
        setState((prev) => ({
          key,
          messages: ui,
          loading: false,
          loadingOlder: false,
          error: null,
          hasPendingToolCalls: hasPending,
          forkBoundaryMessageCount: forkBoundary,
          beforeCursor: body.page?.before_cursor ?? null,
          hasMoreBefore: body.page?.has_more_before === true,
          userMessageOffset: Math.max(0, body.page?.user_message_offset ?? 0),
          version: prev.key === key ? prev.version + 1 : 1,
        }));
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setState((prev) => ({
            key,
            messages: [],
            loading: false,
            loadingOlder: false,
            error: null,
            hasPendingToolCalls: false,
            forkBoundaryMessageCount: null,
            beforeCursor: null,
            hasMoreBefore: false,
            userMessageOffset: 0,
            version: prev.key === key ? prev.version + 1 : 1,
          }));
        } else {
          setState((prev) => ({
            key,
            messages: [],
            loading: false,
            loadingOlder: false,
            error: (e as Error).message,
            hasPendingToolCalls: false,
            forkBoundaryMessageCount: null,
            beforeCursor: null,
            hasMoreBefore: false,
            userMessageOffset: 0,
            version: prev.key === key ? prev.version : 0,
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, token, refreshSeq]);

  const loadOlder = useCallback(async () => {
    if (!key || loadingOlderRef.current) return;
    const before = state.key === key ? state.beforeCursor : null;
    if (!before || !state.hasMoreBefore) return;
    loadingOlderRef.current = true;
    setState((prev) => (prev.key === key ? { ...prev, loadingOlder: true, error: null } : prev));
    try {
      const body = await fetchWebuiThread(token, key, {
        limit: OLDER_HISTORY_PAGE_LIMIT,
        before,
      });
      setState((prev) => {
        if (prev.key !== key) return prev;
        if (!body?.messages?.length) {
          return {
            ...prev,
            loadingOlder: false,
            hasMoreBefore: false,
            beforeCursor: null,
          };
        }
        const older = persistedMessagesToUi(body.messages);
        const olderBoundary =
          typeof body.fork_boundary_message_count === "number"
            ? Math.max(0, Math.min(body.fork_boundary_message_count, older.length))
            : null;
        const shiftedBoundary =
          prev.forkBoundaryMessageCount === null
            ? null
            : prev.forkBoundaryMessageCount + older.length;
        const nextMessages = [...older, ...prev.messages];
        return {
          ...prev,
          messages: nextMessages,
          loadingOlder: false,
          error: null,
          hasPendingToolCalls: hasPendingAgentActivity(nextMessages),
          forkBoundaryMessageCount: olderBoundary ?? shiftedBoundary,
          beforeCursor: body.page?.before_cursor ?? null,
          hasMoreBefore: body.page?.has_more_before === true,
          userMessageOffset: Math.max(0, body.page?.user_message_offset ?? 0),
          version: prev.version + 1,
        };
      });
    } catch (e) {
      setState((prev) =>
        prev.key === key
          ? {
              ...prev,
              loadingOlder: false,
              error: (e as Error).message,
            }
          : prev,
      );
    } finally {
      loadingOlderRef.current = false;
    }
  }, [key, state.beforeCursor, state.hasMoreBefore, state.key, token]);

  if (!key) {
    return {
      messages: EMPTY_MESSAGES,
      loading: false,
      loadingOlder: false,
      error: null,
      refresh,
      loadOlder,
      hasMoreBefore: false,
      userMessageOffset: 0,
      version: 0,
      forkBoundaryMessageCount: null,
      hasPendingToolCalls: false,
    };
  }

  // Even before the effect above commits its loading state, never surface the
  // previous session's payload for a brand-new key.
  if (state.key !== key) {
    return {
      messages: EMPTY_MESSAGES,
      loading: true,
      loadingOlder: false,
      error: null,
      refresh,
      loadOlder,
      hasMoreBefore: false,
      userMessageOffset: 0,
      version: 0,
      forkBoundaryMessageCount: null,
      hasPendingToolCalls: false,
    };
  }

  return {
    messages: state.messages,
    loading: state.loading,
    loadingOlder: state.loadingOlder,
    error: state.error,
    refresh,
    loadOlder,
    hasMoreBefore: state.hasMoreBefore,
    userMessageOffset: state.userMessageOffset,
    version: state.version,
    forkBoundaryMessageCount: state.forkBoundaryMessageCount,
    hasPendingToolCalls: state.hasPendingToolCalls,
  };
}
