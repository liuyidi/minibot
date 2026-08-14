/**
 * Interview / demo UI gates. Flip to `true` when the feature is ready to show.
 * Implementation code stays wired; only entry points are hidden.
 */
export const UI_ENTRY = {
  apps: false,
  /** Microphone / STT in composer — deferred (Phase 8.4 / UX-23, lowest priority). */
  voice: false,
  skills: true,
  automations: true,
  channels: true,
  knowledge: true,
  settings: true,
} as const;

/** Settings sidebar sections (full surface). */
export const SETTINGS_SECTIONS = [
  "profile",
  "overview",
  "appearance",
  "models",
  // "image",
  // "voice",
  "browser",
  "runtime",
  "advanced",
] as const;

export type EnabledSettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Token usage dashboard on the profile page (no backend yet). */
export const SETTINGS_SHOW_PROFILE_USAGE = false;

/** Multi-provider / OAuth panel under Models. */
export const SETTINGS_SHOW_PROVIDERS_PANEL = false;

/** BYOK / personal model configurations under Models. */
export const SETTINGS_SHOW_USER_MODEL_CONFIGS = false;

export function isEnabledSettingsSection(
  section: string | null | undefined,
): section is EnabledSettingsSection {
  if (!section) return false;
  return (SETTINGS_SECTIONS as readonly string[]).includes(section);
}
