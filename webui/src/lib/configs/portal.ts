/** Interview portal URLs (override via VITE_PORTAL_* at build time). */

function envOr(key: string, fallback: string): string {
  const v = (import.meta.env[key] as string | undefined)?.trim();
  return v && v.length > 0 ? v : fallback;
}

export const PORTAL = {
  home: envOr("VITE_PORTAL_HOME", "https://liuyidi.me"),
  langfuse: envOr("VITE_PORTAL_LANGFUSE", "https://mlf.liuyidi.me"),
  knowledge: envOr("VITE_PORTAL_KB", "https://kb.liuyidi.me"),
  /** Same-origin DevUI for interview walkthrough */
  devui: envOr("VITE_PORTAL_DEVUI", "/ui/"),
} as const;
