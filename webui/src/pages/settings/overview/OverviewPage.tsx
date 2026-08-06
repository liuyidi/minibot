import { OverviewSettings } from "./OverviewSettings";
import { useSettingsShell } from "../SettingsShellContext";

export function OverviewPage() {
  const { settings, hasPendingRestart, localPrefs, selectSection } = useSettingsShell();
  if (!settings) return null;
  return (
    <OverviewSettings
      settings={settings}
      requiresRestart={hasPendingRestart}
      showBrandLogos={localPrefs.brandLogos}
      onSelectSection={selectSection}
    />
  );
}
