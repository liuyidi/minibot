import { useState } from "react";

import {
  AutomationsSettings,
  type AutomationAction,
  type AutomationFilter,
  type AutomationSort,
  AutomationCreateDialog,
  AutomationDeleteDialog,
  AutomationEditDialog,
} from "@/pages/automations/automations-ui";
import { useAutomations } from "@/hooks/automations";
import type { AutomationUpdatePayload, SessionAutomationJob } from "@/lib/types";

export function AutomationsPage() {
  const {
    automations,
    loading,
    error,
    actionKey,
    create,
    update,
    runAction,
  } = useAutomations();

  const [automationsQuery, setAutomationsQuery] = useState("");
  const [automationsFilter, setAutomationsFilter] = useState<AutomationFilter>("all");
  const [automationsSort, setAutomationsSort] = useState<AutomationSort>("next");
  const [automationPendingDelete, setAutomationPendingDelete] =
    useState<SessionAutomationJob | null>(null);
  const [automationPendingEdit, setAutomationPendingEdit] =
    useState<SessionAutomationJob | null>(null);
  const [automationCreatePrefill, setAutomationCreatePrefill] =
    useState<{ name?: string; message?: string } | null>(null);

  const handleAutomationAction = async (
    action: AutomationAction,
    job: SessionAutomationJob,
  ) => {
    const payload = await runAction(action, job);
    if (payload && action === "delete") setAutomationPendingDelete(null);
  };

  const handleAutomationEdit = async (
    job: SessionAutomationJob,
    values: AutomationUpdatePayload,
  ) => {
    const payload = await update(job, values);
    if (payload) setAutomationPendingEdit(null);
  };

  const handleAutomationCreate = async (values: {
    name: string;
    message: string;
    session_id: string;
    schedule: NonNullable<AutomationUpdatePayload["schedule"]>;
    delete_after_run?: boolean;
  }) => {
    await create(values);
    setAutomationCreatePrefill(null);
  };

  return (
    <>
      <AutomationsSettings
        payload={automations}
        loading={loading}
        query={automationsQuery}
        filter={automationsFilter}
        sort={automationsSort}
        actionKey={actionKey}
        error={error}
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
        deleting={actionKey === `delete:${automationPendingDelete?.id ?? ""}`}
        onOpenChange={(open) => {
          if (!open) setAutomationPendingDelete(null);
        }}
        onConfirm={(job) => handleAutomationAction("delete", job)}
      />

      <AutomationEditDialog
        job={automationPendingEdit}
        saving={actionKey === `update:${automationPendingEdit?.id ?? ""}`}
        onOpenChange={(open) => {
          if (!open) setAutomationPendingEdit(null);
        }}
        onSave={handleAutomationEdit}
      />

      <AutomationCreateDialog
        open={automationCreatePrefill !== null}
        prefill={automationCreatePrefill}
        saving={actionKey === "create"}
        onOpenChange={(open) => {
          if (!open) setAutomationCreatePrefill(null);
        }}
        onSave={handleAutomationCreate}
      />
    </>
  );
}
