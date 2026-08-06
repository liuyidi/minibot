import { WebSettings } from "./WebSettings";
import { useBrowserSettings } from "./useBrowserSettings";

export function BrowserPage() {
  const {
    settings,
    webSearchForm,
    setWebSearchForm,
    webSearchKeyVisible,
    setWebSearchKeyVisible,
    webSearchKeyEditing,
    setWebSearchKeyEditing,
    webSearchSaving,
    handleWebSearchProviderChange,
    resetWebSearchDraft,
    saveWebSearch,
    localPrefs,
    restartViaSettingsSurface,
    isRestarting,
    requiresRestartPending,
  } = useBrowserSettings();
  if (!settings) return null;
  return (
    <WebSettings
      settings={settings}
      form={webSearchForm}
      keyVisible={webSearchKeyVisible}
      keyEditing={webSearchKeyEditing}
      saving={webSearchSaving}
      onChangeForm={setWebSearchForm}
      onChangeProvider={handleWebSearchProviderChange}
      onToggleKey={() => setWebSearchKeyVisible((visible) => !visible)}
      onToggleKeyEditing={() => {
        setWebSearchKeyEditing((editing) => !editing);
        setWebSearchKeyVisible(false);
        setWebSearchForm((prev) => ({ ...prev, apiKey: "" }));
      }}
      onReset={resetWebSearchDraft}
      onSave={saveWebSearch}
      showBrandLogos={localPrefs.brandLogos}
      onRestart={restartViaSettingsSurface}
      isRestarting={isRestarting}
      requiresRestartPending={requiresRestartPending}
    />
  );
}
