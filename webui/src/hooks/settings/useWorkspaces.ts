import { useCallback, useEffect, useState } from "react";

import { fetchWorkspaces } from "@/lib/apis/api";
import type { WorkspacesPayload } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

export function useWorkspaces(): {
  workspaces: WorkspacesPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<WorkspacesPayload | null>;
} {
  const { token } = useClient();
  const [workspaces, setWorkspaces] = useState<WorkspacesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const payload = await fetchWorkspaces(token);
      setWorkspaces(payload);
      setError(null);
      return payload;
    } catch (e) {
      setWorkspaces(null);
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const payload = await fetchWorkspaces(token);
        if (!cancelled) {
          setWorkspaces(payload);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setWorkspaces(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { workspaces, loading, error, refresh };
}
