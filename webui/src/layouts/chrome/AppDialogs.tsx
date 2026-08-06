import { useTranslation } from "react-i18next";

import { DeleteConfirm } from "@/components/shell/DeleteConfirm";
import { RenameChatDialog } from "@/components/shell/RenameChatDialog";
import type { AppLayoutModel } from "@/layouts/hooks/useAppLayoutModel";

export function AppDialogs({ model }: { model: AppLayoutModel }) {
  const { t } = useTranslation();
  const { chatActions, sessionRuntime } = model;
  const {
    pendingDelete,
    pendingRename,
    pendingProjectRename,
    setPendingDelete,
    setPendingRename,
    setPendingProjectRename,
    onConfirmDelete,
    onConfirmRename,
    onConfirmProjectRename,
  } = chatActions;

  return (
    <>
      <DeleteConfirm
        open={!!pendingDelete}
        title={pendingDelete?.label ?? ""}
        automations={pendingDelete?.automations}
        onCancel={() => setPendingDelete(null)}
        onConfirm={onConfirmDelete}
      />
      <RenameChatDialog
        open={!!pendingRename}
        title={pendingRename?.label ?? ""}
        onCancel={() => setPendingRename(null)}
        onConfirm={onConfirmRename}
      />
      <RenameChatDialog
        open={!!pendingProjectRename}
        title={pendingProjectRename?.label ?? ""}
        dialogTitle={t("chat.renameProjectTitle")}
        description={t("chat.renameProjectDescription")}
        placeholder={t("chat.renameProjectPlaceholder")}
        onCancel={() => setPendingProjectRename(null)}
        onConfirm={onConfirmProjectRename}
      />
      {sessionRuntime.restartToast ? (
        <div
          role="status"
          className="fixed left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-full border border-border/70 bg-popover px-4 py-2 text-sm font-medium text-popover-foreground shadow-lg"
        >
          {sessionRuntime.restartToast}
        </div>
      ) : null}
    </>
  );
}
