import { TranscriptionSettings } from "./TranscriptionSettings";
import { useVoiceSettings } from "./useVoiceSettings";

export function VoicePage() {
  const {
    settings,
    transcriptionForm,
    setTranscriptionForm,
    transcriptionDirty,
    transcriptionSaving,
    saveTranscriptionSettings,
    selectSection,
    localPrefs,
    restartViaSettingsSurface,
    isRestarting,
    requiresRestartPending,
  } = useVoiceSettings();
  if (!settings) return null;
  return (
    <TranscriptionSettings
      settings={settings}
      form={transcriptionForm}
      dirty={transcriptionDirty}
      saving={transcriptionSaving}
      onChangeForm={setTranscriptionForm}
      onSave={saveTranscriptionSettings}
      onOpenProviders={() => selectSection("models")}
      showBrandLogos={localPrefs.brandLogos}
      onRestart={restartViaSettingsSurface}
      isRestarting={isRestarting}
      requiresRestartPending={requiresRestartPending}
    />
  );
}
