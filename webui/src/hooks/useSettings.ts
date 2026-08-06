import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { fetchSettings } from "@/lib/apis/api";
import type { SettingsPayload } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

export function useSettings(): {
  settings: SettingsPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<SettingsPayload | null>;
  setSettings: Dispatch<SetStateAction<SettingsPayload | null>>;
} {
  const { token } = useClient();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const payload = await fetchSettings(token);
      setSettings(payload);
      setError(null);
      return payload;
    } catch (e) {
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
        const payload = await fetchSettings(token);
        if (!cancelled) {
          setSettings(payload);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSettings(null);
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

  return { settings, loading, error, refresh, setSettings };
}
