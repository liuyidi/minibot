import { useCallback, useEffect, useState } from "react";

import {
  createAutomation,
  fetchAutomations,
  runAutomationAction,
  updateAutomation,
} from "@/lib/apis/api";
import type { AutomationsPayload, AutomationUpdatePayload, SessionAutomationJob } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

export type AutomationActionKind = "enable" | "disable" | "delete" | "run";

export type AutomationCreateValues = {
  name: string;
  message: string;
  session_id: string;
  schedule: NonNullable<AutomationUpdatePayload["schedule"]>;
  delete_after_run?: boolean;
};

export function useAutomations(): {
  automations: AutomationsPayload | null;
  loading: boolean;
  error: string | null;
  actionKey: string | null;
  setError: (error: string | null) => void;
  refresh: (showLoading?: boolean) => Promise<void>;
  create: (values: AutomationCreateValues) => Promise<AutomationsPayload>;
  update: (
    job: SessionAutomationJob,
    values: AutomationUpdatePayload,
  ) => Promise<AutomationsPayload | null>;
  runAction: (
    action: AutomationActionKind,
    job: SessionAutomationJob,
  ) => Promise<AutomationsPayload | null>;
} {
  const { token } = useClient();
  const [automations, setAutomations] = useState<AutomationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const refresh = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const payload = await fetchAutomations(token);
        setAutomations(payload);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAutomations(token)
      .then((payload) => {
        if (cancelled) return;
        setAutomations(payload);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const runAction = useCallback(
    async (action: AutomationActionKind, job: SessionAutomationJob) => {
      const key = `${action}:${job.id}`;
      setActionKey(key);
      setError(null);
      try {
        const payload = await runAutomationAction(token, action, job.id);
        setAutomations(payload);
        if (action === "run") {
          window.setTimeout(() => void refresh(false), 1200);
          window.setTimeout(() => void refresh(false), 4000);
        }
        return payload;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setActionKey(null);
      }
    },
    [refresh, token],
  );

  const update = useCallback(
    async (job: SessionAutomationJob, values: AutomationUpdatePayload) => {
      const key = `update:${job.id}`;
      setActionKey(key);
      setError(null);
      try {
        const payload = await updateAutomation(token, job.id, values);
        setAutomations(payload);
        return payload;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setActionKey(null);
      }
    },
    [token],
  );

  const create = useCallback(
    async (values: AutomationCreateValues) => {
      setActionKey("create");
      setError(null);
      try {
        const payload = await createAutomation(token, values);
        setAutomations(payload);
        return payload;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setActionKey(null);
      }
    },
    [token],
  );

  return {
    automations,
    loading,
    error,
    actionKey,
    setError,
    refresh,
    create,
    update,
    runAction,
  };
}
