const UMAMI_APP = "site";

/**
 * @param {string} event
 * @param {Record<string, string | number | boolean | undefined | null>} [data]
 */
export function track(event, data = {}) {
  if (typeof window === "undefined") return;
  const payload = { app: UMAMI_APP };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === "") continue;
    payload[key] = value;
  }
  try {
    window.umami?.track?.(event, payload);
  } catch {
    /* analytics must never break UI */
  }
}
