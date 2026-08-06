import { ModelsSettings, NewModelConfigurationDialog } from "./ModelsSettings";
import { SETTINGS_SHOW_PROVIDERS_PANEL } from "@/lib/configs/ui-entry";
import { ProvidersSettings } from "./ProvidersSettings";
import { useModelsSettings } from "./useModelsSettings";

export function ModelsSettingsPage() {
  const {
    token,
    settings,
    form,
    setForm,
    modelDirty,
    saving,
    localPrefs,
    providerSaving,
    runProviderOAuth,
    saveModelSettings,
    openModelConfigurationDialog,
    activatePlatformModelSelection,
    activateAutoModelSelection,
    expandedProvider,
    providerForms,
    setProviderForms,
    visibleProviderKeys,
    editingProviderKeys,
    providerQuery,
    setProviderQuery,
    handleToggleProvider,
    toggleProviderKeyVisibility,
    toggleProviderKeyEditing,
    saveProvider,
    resetProviderDraft,
    pendingRestartSections,
    restartViaSettingsSurface,
    isRestarting,
    modelConfigurationOpen,
    setModelConfigurationOpen,
    modelConfigurationForm,
    setModelConfigurationForm,
    modelConfigurationSaving,
    configuredModelProviderOptions,
    handleCreateModelConfiguration,
  } = useModelsSettings();
  if (!settings) return null;
  return (
    <>
      <NewModelConfigurationDialog
        open={modelConfigurationOpen}
        draft={modelConfigurationForm}
        providers={configuredModelProviderOptions}
        saving={modelConfigurationSaving}
        showProviderLogos={localPrefs.brandLogos}
        onOpenChange={setModelConfigurationOpen}
        onChangeDraft={setModelConfigurationForm}
        onSave={handleCreateModelConfiguration}
      />
      <div className="space-y-8">
        <ModelsSettings
          token={token}
          form={form}
          setForm={setForm}
          settings={settings}
          dirty={modelDirty}
          saving={saving}
          showBrandLogos={localPrefs.brandLogos}
          providerSaving={providerSaving}
          onProviderOAuthLogin={(provider) => runProviderOAuth(provider, "login")}
          onSave={saveModelSettings}
          onCreateConfiguration={openModelConfigurationDialog}
          onActivatePlatformModel={activatePlatformModelSelection}
          onActivateAuto={activateAutoModelSelection}
        />
        {SETTINGS_SHOW_PROVIDERS_PANEL ? (
          <ProvidersSettings
            settings={settings}
            expandedProvider={expandedProvider}
            providerForms={providerForms}
            visibleProviderKeys={visibleProviderKeys}
            editingProviderKeys={editingProviderKeys}
            providerSaving={providerSaving}
            query={providerQuery}
            showBrandLogos={localPrefs.brandLogos}
            onQueryChange={setProviderQuery}
            onToggleProvider={handleToggleProvider}
            onToggleProviderKey={toggleProviderKeyVisibility}
            onToggleProviderKeyEditing={toggleProviderKeyEditing}
            onChangeProviderForm={(provider, value) =>
              setProviderForms((prev) => ({
                ...prev,
                [provider]: {
                  apiKey: prev[provider]?.apiKey ?? "",
                  apiBase: prev[provider]?.apiBase ?? "",
                  apiType: prev[provider]?.apiType ?? "auto",
                  ...value,
                },
              }))
            }
            onSaveProvider={saveProvider}
            onProviderOAuthLogin={(provider) => runProviderOAuth(provider, "login")}
            onProviderOAuthLogout={(provider) => runProviderOAuth(provider, "logout")}
            onResetProviderDraft={resetProviderDraft}
            imageProviderRestartPending={pendingRestartSections.image}
            onRestart={restartViaSettingsSurface}
            isRestarting={isRestarting}
          />
        ) : null}
      </div>
    </>
  );
}
