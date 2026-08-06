import { useCallback, useEffect, useState } from "react";

import { fetchSettingsUsage } from "@/lib/apis/api";
import type { SettingsPayload } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

type Usage = NonNullable<SettingsPayload["usage"]>;

/**
 * Poll settings usage while `enabled` (e.g. overview section visible).
 * Does not own full settings — callers merge `usage` into their settings state.
 */
export function useSettingsUsage(enabled: boolean): {
  usage: Usage | null;
  error: string | null;
  refresh: () => Promise<Usage | null>;
} {
  const { token } = useClient();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchSettingsUsage(token);
      setUsage(next);
      setError(null);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [token]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = () => {
      void fetchSettingsUsage(token)
        .then((next) => {
          if (!cancelled) {
            setUsage(next);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        });
    };
    tick();
    const interval = window.setInterval(tick, 5000);
    const onFocus = () => tick();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, token]);

  return { usage, error, refresh };
}
