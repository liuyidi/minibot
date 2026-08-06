import { AppearanceSettings } from "./AppearanceSettings";
import { useSettingsShell } from "../SettingsShellContext";

export function AppearancePage() {
  const { theme, onToggleTheme, localPrefs, setLocalPrefs } = useSettingsShell();
  return (
    <AppearanceSettings
      theme={theme}
      onToggleTheme={onToggleTheme}
      localPrefs={localPrefs}
      onChangeLocalPrefs={setLocalPrefs}
    />
  );
}
