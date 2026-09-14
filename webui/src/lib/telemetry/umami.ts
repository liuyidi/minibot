const UMAMI_APP = "bot";

declare global {
  interface Window {
    umami?: {
      track: (
        event: string | ((props: Record<string, unknown>) => Record<string, unknown>),
        data?: Record<string, unknown>,
      ) => void;
      identify?: (id: string, data?: Record<string, unknown>) => void;
    };
  }
}

export function trackUmami(
  event: string,
  data: Record<string, string | number | boolean | undefined | null> = {},
): void {
  if (typeof window === "undefined") return;
  const payload: Record<string, string | number | boolean> = { app: UMAMI_APP };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === "") continue;
    payload[key] = value;
  }
  try {
    window.umami?.track?.(event, payload);
  } catch {
    /* ignore */
  }
}

/** Hash-router page views for SPA paths like `/#/chat/...`. */
export function trackUmamiPageview(): void {
  if (typeof window === "undefined") return;
  const url = `${window.location.pathname}${window.location.hash || "#/"}`;
  try {
    window.umami?.track?.((props) => ({
      ...props,
      url,
      app: UMAMI_APP,
    }));
  } catch {
    /* ignore */
  }
}

export function identifyUmami(userId: string): void {
  const id = userId.trim();
  if (!id || typeof window === "undefined") return;
  try {
    window.umami?.identify?.(id, { app: UMAMI_APP });
  } catch {
    /* ignore */
  }
}
