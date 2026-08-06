import { useEffect, useState } from "react";

import { fetchProviderModels } from "@/lib/apis/api";
import type { ProviderModelsPayload } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

export function useProviderModels(
  provider: string | null | undefined,
  enabled = true,
): {
  models: ProviderModelsPayload | null;
  loading: boolean;
  error: string | null;
} {
  const { token } = useClient();
  const [models, setModels] = useState<ProviderModelsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider || !enabled) {
      setModels(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setModels(null);
    setError(null);
    fetchProviderModels(token, provider)
      .then((payload) => {
        if (!cancelled) {
          setModels(payload);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setModels(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, enabled, token]);

  return { models, loading, error };
}
