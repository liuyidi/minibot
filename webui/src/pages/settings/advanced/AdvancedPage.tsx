import { AdvancedSettings } from "./AdvancedSettings";
import { useAdvancedSettings } from "./useAdvancedSettings";

export function AdvancedPage() {
  const {
    settings,
    networkSafetyForm,
    setNetworkSafetyForm,
    networkSafetyDirty,
    networkSafetySaving,
    saveNetworkSafetySettings,
    restartViaSettingsSurface,
    isRestarting,
    requiresRestartPending,
  } = useAdvancedSettings();
  if (!settings) return null;
  return (
    <AdvancedSettings
      form={networkSafetyForm}
      dirty={networkSafetyDirty}
      saving={networkSafetySaving}
      isNativeHostSurface={(settings.surface ?? settings.runtime_surface) === "native"}
      onChangeForm={setNetworkSafetyForm}
      onSave={saveNetworkSafetySettings}
      onRestart={restartViaSettingsSurface}
      isRestarting={isRestarting}
      requiresRestartPending={requiresRestartPending}
    />
  );
}
