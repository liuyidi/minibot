import { describe, expect, it } from "vitest";

import {
  SETTINGS_SECTIONS,
  SETTINGS_SHOW_PROFILE_USAGE,
  SETTINGS_SHOW_PROVIDERS_PANEL,
  SETTINGS_SHOW_USER_MODEL_CONFIGS,
  UI_ENTRY,
  isEnabledSettingsSection,
} from "@/lib/configs/ui-entry";

describe("ui-entry gates", () => {
  it("enables primary sidebar utilities and keeps composer voice hidden", () => {
    expect(UI_ENTRY.settings).toBe(true);
    expect(UI_ENTRY.apps).toBe(false);
    expect(UI_ENTRY.voice).toBe(false);
    expect(UI_ENTRY.skills).toBe(true);
    expect(UI_ENTRY.automations).toBe(true);
    expect(UI_ENTRY.channels).toBe(true);
    expect(UI_ENTRY.knowledge).toBe(true);
  });

  it("exposes the enabled settings section set", () => {
    expect([...SETTINGS_SECTIONS]).toEqual([
      "profile",
      "overview",
      "appearance",
      "models",
      "browser",
      "runtime",
      "advanced",
    ]);
    expect(SETTINGS_SHOW_PROVIDERS_PANEL).toBe(false);
    expect(SETTINGS_SHOW_USER_MODEL_CONFIGS).toBe(false);
    expect(SETTINGS_SHOW_PROFILE_USAGE).toBe(false);
  });

  it("recognizes enabled settings sections", () => {
    expect(isEnabledSettingsSection("profile")).toBe(true);
    expect(isEnabledSettingsSection("overview")).toBe(true);
    expect(isEnabledSettingsSection("models")).toBe(true);
    expect(isEnabledSettingsSection("browser")).toBe(true);
    expect(isEnabledSettingsSection("apps")).toBe(false);
    expect(isEnabledSettingsSection("image")).toBe(false);
    expect(isEnabledSettingsSection("voice")).toBe(false);
    expect(isEnabledSettingsSection("channels")).toBe(false);
    expect(isEnabledSettingsSection(null)).toBe(false);
  });
});
