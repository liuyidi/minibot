import { RuntimeSettings } from "./RuntimeSettings";
import { useRuntimeSettings } from "./useRuntimeSettings";

export function RuntimePage() {
  const {
    settings,
    form,
    setForm,
    runtimeDirty,
    saving,
    saveRuntimeSettings,
    restartViaSettingsSurface,
    isRestarting,
    requiresRestartPending,
  } = useRuntimeSettings();
  if (!settings) return null;
  return (
    <RuntimeSettings
      form={form}
      setForm={setForm}
      settings={settings}
      dirty={runtimeDirty}
      saving={saving}
      onSave={saveRuntimeSettings}
      onRestart={restartViaSettingsSurface}
      isRestarting={isRestarting}
      requiresRestartPending={requiresRestartPending}
    />
  );
}
