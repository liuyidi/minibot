/**
 * Browser / device / soft-geo context for boot spans (ES dashboards).
 * City comes from an optional public-IP lookup (best-effort, short timeout).
 */

export type ClientContext = {
  "device.type": string;
  "os.name": string;
  "browser.name": string;
  "browser.version": string;
  "client.locale": string;
  "client.language": string;
  "client.timezone": string;
  "device.screen_w": number;
  "device.screen_h": number;
};

export type GeoContext = {
  "geo.city_name"?: string;
  "geo.region_name"?: string;
  "geo.country_name"?: string;
  "geo.country_iso_code"?: string;
  "client.address"?: string;
  "geo.source": string;
};

function ua(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

/** Lightweight UA parse — good enough for dashboard breakdowns, not fraud detection. */
export function detectClientContext(
  userAgent = ua(),
  nav: Partial<Navigator> | undefined = typeof navigator !== "undefined" ? navigator : undefined,
  screenObj: { width?: number; height?: number } | undefined =
    typeof screen !== "undefined" ? screen : undefined,
): ClientContext {
  const uaLower = userAgent.toLowerCase();

  let deviceType = "desktop";
  if (/ipad|tablet|kindle|playbook/.test(uaLower)) deviceType = "tablet";
  else if (/mobi|iphone|android.*mobile|windows phone/.test(uaLower)) deviceType = "mobile";

  let osName = "unknown";
  if (/windows nt/.test(uaLower)) osName = "Windows";
  else if (/android/.test(uaLower)) osName = "Android";
  else if (/iphone|ipad|ipod/.test(uaLower)) osName = "iOS";
  else if (/mac os x|macintosh/.test(uaLower)) osName = "macOS";
  else if (/cros/.test(uaLower)) osName = "ChromeOS";
  else if (/linux/.test(uaLower)) osName = "Linux";

  let browserName = "unknown";
  let browserVersion = "";
  const edge = userAgent.match(/Edg\/([\d.]+)/);
  const chrome = userAgent.match(/Chrome\/([\d.]+)/);
  const firefox = userAgent.match(/Firefox\/([\d.]+)/);
  const safari = userAgent.match(/Version\/([\d.]+).*Safari/);
  if (edge) {
    browserName = "Edge";
    browserVersion = edge[1] ?? "";
  } else if (firefox) {
    browserName = "Firefox";
    browserVersion = firefox[1] ?? "";
  } else if (chrome && !/OPR\//.test(userAgent)) {
    browserName = "Chrome";
    browserVersion = chrome[1] ?? "";
  } else if (safari) {
    browserName = "Safari";
    browserVersion = safari[1] ?? "";
  }

  let timezone = "unknown";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  } catch {
    // ignore
  }

  const locale = nav?.language || "unknown";
  const language = locale.includes("-") ? locale.split("-")[0]! : locale;

  return {
    "device.type": deviceType,
    "os.name": osName,
    "browser.name": browserName,
    "browser.version": browserVersion || "unknown",
    "client.locale": locale,
    "client.language": language,
    "client.timezone": timezone,
    "device.screen_w": screenObj?.width ?? 0,
    "device.screen_h": screenObj?.height ?? 0,
  };
}

type IpApiResponse = {
  status?: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  query?: string;
};

/**
 * Best-effort city/IP enrichment for local dashboards.
 * Uses ip-api.com (HTTP, no key). Skips in test / when fetch missing / on timeout.
 */
export async function lookupGeoBestEffort(options?: {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  url?: string;
}): Promise<GeoContext> {
  const timeoutMs = options?.timeoutMs ?? 800;
  const fetchImpl = options?.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fetchImpl) {
    return { "geo.source": "none" };
  }

  const url =
    options?.url ??
    "http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,query";

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    ctrl && typeof setTimeout !== "undefined"
      ? setTimeout(() => ctrl.abort(), timeoutMs)
      : null;

  try {
    const res = await fetchImpl(url, {
      signal: ctrl?.signal,
      // Avoid sending cookies.
      credentials: "omit",
    });
    if (!res.ok) return { "geo.source": "ip-api_http_error" };
    const data = (await res.json()) as IpApiResponse;
    if (data.status !== "success") return { "geo.source": "ip-api_fail" };
    return {
      "geo.source": "ip-api",
      "geo.city_name": data.city || undefined,
      "geo.region_name": data.regionName || undefined,
      "geo.country_name": data.country || undefined,
      "geo.country_iso_code": data.countryCode || undefined,
      "client.address": data.query || undefined,
    };
  } catch {
    return { "geo.source": "timeout_or_blocked" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function flattenContext(
  ...parts: Array<Record<string, string | number | boolean | undefined | null>>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const part of parts) {
    for (const [k, v] of Object.entries(part)) {
      if (v == null || v === "") continue;
      out[k] = v;
    }
  }
  return out;
}
