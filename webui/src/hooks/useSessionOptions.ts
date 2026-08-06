import { useEffect, useState } from "react";

import { listSessions } from "@/lib/apis/api";
import type { ChatSummary } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

function sortSessionsByRecency(rows: ChatSummary[]): ChatSummary[] {
  return [...rows].sort((a, b) =>
    (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""),
  );
}

/** Loads chat sessions for pickers (e.g. automation create dialog). */
export function useSessionOptions(enabled: boolean): {
  sessions: ChatSummary[];
  loading: boolean;
  error: string | null;
} {
  const { token } = useClient();
  const [sessions, setSessions] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listSessions(token)
      .then((rows) => {
        if (cancelled) return;
        setSessions(sortSessionsByRecency(rows));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  return { sessions, loading, error };
}
