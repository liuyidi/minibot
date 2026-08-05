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

/** Settings sidebar sections enabled for the slim demo Settings surface. */
export const SETTINGS_SECTIONS = [
  "overview",
  "appearance",
  "models",
  "runtime",
] as const;

export type EnabledSettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Multi-provider / OAuth panel under Models — hidden until backend parity. */
export const SETTINGS_SHOW_PROVIDERS_PANEL = false;

export function isEnabledSettingsSection(
  section: string | null | undefined,
): section is EnabledSettingsSection {
  if (!section) return false;
  return (SETTINGS_SECTIONS as readonly string[]).includes(section);
}
