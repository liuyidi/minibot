import { AppearanceSettings } from "./AppearanceSettings";
import { useSettingsShell } from "../SettingsShellContext";

export function AppearancePage() {
  const { theme, themePreference, onThemeChange, onToggleTheme, localPrefs, setLocalPrefs } =
    useSettingsShell();
  return (
    <AppearanceSettings
      themePreference={themePreference ?? theme}
      onThemeChange={(next) => {
        if (onThemeChange) {
          onThemeChange(next);
          return;
        }
        // Fallback for callers that only wire toggle (tests / older shells).
        if (next === "system") return;
        if (next !== theme) onToggleTheme();
      }}
      localPrefs={localPrefs}
      onChangeLocalPrefs={setLocalPrefs}
    />
  );
}
