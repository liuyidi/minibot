import { describe, expect, it } from "vitest";

import {
  SETTINGS_SECTIONS,
  SETTINGS_SHOW_PROVIDERS_PANEL,
  UI_ENTRY,
  isEnabledSettingsSection,
} from "@/lib/ui-entry";

describe("ui-entry gates", () => {
  it("enables settings and keeps other sidebar utilities hidden", () => {
    expect(UI_ENTRY.settings).toBe(true);
    expect(UI_ENTRY.apps).toBe(false);
    expect(UI_ENTRY.skills).toBe(false);
    expect(UI_ENTRY.automations).toBe(false);
  });

  it("exposes only the slim settings section set", () => {
    expect([...SETTINGS_SECTIONS]).toEqual([
      "overview",
      "appearance",
      "models",
      "runtime",
    ]);
    expect(SETTINGS_SHOW_PROVIDERS_PANEL).toBe(false);
  });

  it("recognizes enabled settings sections", () => {
    expect(isEnabledSettingsSection("overview")).toBe(true);
    expect(isEnabledSettingsSection("models")).toBe(true);
    expect(isEnabledSettingsSection("browser")).toBe(false);
    expect(isEnabledSettingsSection("apps")).toBe(false);
    expect(isEnabledSettingsSection(null)).toBe(false);
  });
});
