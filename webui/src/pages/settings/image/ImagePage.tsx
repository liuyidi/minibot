import { ImageGenerationSettings } from "./ImageGenerationSettings";
import { useImageSettings } from "./useImageSettings";

export function ImagePage() {
  const {
    settings,
    imageGenerationForm,
    setImageGenerationForm,
    imageGenerationDirty,
    imageGenerationSaving,
    saveImageGenerationSettings,
    selectSection,
    localPrefs,
    restartViaSettingsSurface,
    isRestarting,
    requiresRestartPending,
  } = useImageSettings();
  if (!settings) return null;
  return (
    <ImageGenerationSettings
      settings={settings}
      form={imageGenerationForm}
      dirty={imageGenerationDirty}
      saving={imageGenerationSaving}
      onChangeForm={setImageGenerationForm}
      onSave={saveImageGenerationSettings}
      onOpenProviders={() => selectSection("models")}
      showBrandLogos={localPrefs.brandLogos}
      onRestart={restartViaSettingsSurface}
      isRestarting={isRestarting}
      requiresRestartPending={requiresRestartPending}
    />
  );
}
