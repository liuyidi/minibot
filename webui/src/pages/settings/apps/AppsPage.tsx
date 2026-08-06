import { AppsCatalogSettings } from "./AppsCatalogSettings";
import { useAppsSettings } from "./useAppsSettings";

export function AppsPage() {
  const {
    cliApps,
    mcpPresets,
    cliAppsLoading,
    mcpPresetsLoading,
    appsQuery,
    setAppsQuery,
    appsKindFilter,
    setAppsKindFilter,
    cliAppsAction,
    mcpPresetAction,
    cliAppsMessage,
    cliAppsError,
    cliAppsFocusName,
    mcpMessage,
    mcpError,
    mcpFieldValues,
    setMcpFieldValues,
    customMcpForm,
    setCustomMcpForm,
    mcpConfigImport,
    setMcpConfigImport,
    handleCliAppAction,
    handleMcpPresetAction,
    handleSaveCustomMcp,
    handleImportMcpConfig,
    handleMcpToolsChange,
    setCliAppsMessage,
    setCliAppsError,
    setMcpMessage,
    setMcpError,
    localPrefs,
    pendingRestartSections,
    onBackToChat,
    restartViaSettingsSurface,
    isRestarting,
  } = useAppsSettings();
  return (
    <AppsCatalogSettings
      cliApps={cliApps}
      mcpPresets={mcpPresets}
      cliAppsLoading={cliAppsLoading}
      mcpPresetsLoading={mcpPresetsLoading}
      query={appsQuery}
      filter={appsKindFilter}
      cliActionKey={cliAppsAction}
      mcpActionKey={mcpPresetAction}
      cliMessage={cliAppsMessage}
      cliError={cliAppsError}
      cliFocusName={cliAppsFocusName}
      mcpMessage={mcpMessage}
      mcpError={mcpError}
      mcpFieldValues={mcpFieldValues}
      customMcpForm={customMcpForm}
      mcpConfigImport={mcpConfigImport}
      showBrandLogos={localPrefs.brandLogos}
      requiresRestartPending={pendingRestartSections.runtime}
      onQueryChange={setAppsQuery}
      onFilterChange={setAppsKindFilter}
      onCliAction={handleCliAppAction}
      onMcpAction={handleMcpPresetAction}
      onDismissStatus={() => {
        setCliAppsMessage(null);
        setCliAppsError(null);
        setMcpMessage(null);
        setMcpError(null);
      }}
      onBackToChat={onBackToChat}
      onMcpFieldChange={(presetName, fieldName, value) => {
        setMcpFieldValues((prev) => ({
          ...prev,
          [presetName]: {
            ...(prev[presetName] ?? {}),
            [fieldName]: value,
          },
        }));
      }}
      onCustomMcpFormChange={setCustomMcpForm}
      onMcpConfigImportChange={setMcpConfigImport}
      onSaveCustomMcp={handleSaveCustomMcp}
      onImportMcpConfig={handleImportMcpConfig}
      onMcpToolsChange={handleMcpToolsChange}
      onRestart={restartViaSettingsSurface}
      isRestarting={isRestarting}
    />
  );
}
