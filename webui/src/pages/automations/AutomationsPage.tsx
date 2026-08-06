import { useCallback, useEffect, useState } from "react";

import {
  AutomationsSettings,
  type AutomationAction,
  type AutomationFilter,
  type AutomationSort,
  AutomationCreateDialog,
  AutomationDeleteDialog,
  AutomationEditDialog,
} from "@/pages/automations/automations-ui";
import {
  createAutomation,
  fetchAutomations,
  runAutomationAction,
  updateAutomation,
} from "@/lib/apis/api";
import type { AutomationsPayload, AutomationUpdatePayload, SessionAutomationJob } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

export function AutomationsPage() {
  const { token } = useClient();
  const [automations, setAutomations] = useState<AutomationsPayload | null>(null);
  const [automationsLoading, setAutomationsLoading] = useState(true);
  const [automationsQuery, setAutomationsQuery] = useState("");
  const [automationsFilter, setAutomationsFilter] = useState<AutomationFilter>("all");
  const [automationsSort, setAutomationsSort] = useState<AutomationSort>("next");
  const [automationsError, setAutomationsError] = useState<string | null>(null);
  const [automationAction, setAutomationAction] = useState<string | null>(null);
  const [automationPendingDelete, setAutomationPendingDelete] =
    useState<SessionAutomationJob | null>(null);
  const [automationPendingEdit, setAutomationPendingEdit] =
    useState<SessionAutomationJob | null>(null);
  const [automationCreatePrefill, setAutomationCreatePrefill] =
    useState<{ name?: string; message?: string } | null>(null);

  const refreshAutomations = useCallback(
    async (showLoading = false) => {
      if (showLoading) setAutomationsLoading(true);
      try {
        const payload = await fetchAutomations(token);
        setAutomations(payload);
        setAutomationsError(null);
      } catch (err) {
        setAutomationsError((err as Error).message);
      } finally {
        if (showLoading) setAutomationsLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    let cancelled = false;
    setAutomationsLoading(true);
    fetchAutomations(token)
      .then((payload) => {
        if (cancelled) return;
        setAutomations(payload);
        setAutomationsError(null);
      })
      .catch((err) => {
        if (!cancelled) setAutomationsError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setAutomationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAutomationAction = async (
    action: AutomationAction,
    job: SessionAutomationJob,
  ) => {
    const key = `${action}:${job.id}`;
    setAutomationAction(key);
    setAutomationsError(null);
    try {
      const payload = await runAutomationAction(token, action, job.id);
      setAutomations(payload);
      if (action === "delete") setAutomationPendingDelete(null);
      if (action === "run") {
        window.setTimeout(() => void refreshAutomations(false), 1200);
        window.setTimeout(() => void refreshAutomations(false), 4000);
      }
    } catch (err) {
      setAutomationsError((err as Error).message);
    } finally {
      setAutomationAction(null);
    }
  };

  const handleAutomationEdit = async (
    job: SessionAutomationJob,
    values: AutomationUpdatePayload,
  ) => {
    const key = `update:${job.id}`;
    setAutomationAction(key);
    setAutomationsError(null);
    try {
      const payload = await updateAutomation(token, job.id, values);
      setAutomations(payload);
      setAutomationPendingEdit(null);
    } catch (err) {
      setAutomationsError((err as Error).message);
    } finally {
      setAutomationAction(null);
    }
  };

  const handleAutomationCreate = async (values: {
    name: string;
    message: string;
    session_id: string;
    schedule: NonNullable<AutomationUpdatePayload["schedule"]>;
    delete_after_run?: boolean;
  }) => {
    setAutomationAction("create");
    setAutomationsError(null);
    try {
      const payload = await createAutomation(token, values);
      setAutomations(payload);
      setAutomationCreatePrefill(null);
    } catch (err) {
      setAutomationsError((err as Error).message);
      throw err;
    } finally {
      setAutomationAction(null);
    }
  };

  return (
    <>
      <AutomationsSettings
        payload={automations}
        loading={automationsLoading}
        query={automationsQuery}
        filter={automationsFilter}
        sort={automationsSort}
        actionKey={automationAction}
        error={automationsError}
        onQueryChange={setAutomationsQuery}
        onFilterChange={setAutomationsFilter}
        onSortChange={setAutomationsSort}
        onAction={handleAutomationAction}
        onRequestEdit={setAutomationPendingEdit}
        onRequestDelete={setAutomationPendingDelete}
        onRequestCreate={(prefill) => setAutomationCreatePrefill(prefill ?? {})}
      />

      <AutomationDeleteDialog
        job={automationPendingDelete}
        deleting={automationAction === `delete:${automationPendingDelete?.id ?? ""}`}
        onOpenChange={(open) => {
          if (!open) setAutomationPendingDelete(null);
        }}
        onConfirm={(job) => handleAutomationAction("delete", job)}
      />

      <AutomationEditDialog
        job={automationPendingEdit}
        saving={automationAction === `update:${automationPendingEdit?.id ?? ""}`}
        onOpenChange={(open) => {
          if (!open) setAutomationPendingEdit(null);
        }}
        onSave={handleAutomationEdit}
      />

      <AutomationCreateDialog
        open={automationCreatePrefill !== null}
        prefill={automationCreatePrefill}
        token={token}
        saving={automationAction === "create"}
        onOpenChange={(open) => {
          if (!open) setAutomationCreatePrefill(null);
        }}
        onSave={handleAutomationCreate}
      />
    </>
  );
}
