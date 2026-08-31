import { PORTAL } from "@/lib/configs/portal";

/** True when the hash is the legacy WebUI download route (`#/download`). */
export function isLegacyDownloadHash(hash = typeof window !== "undefined" ? window.location.hash : ""): boolean {
  const path = hash.replace(/^#/, "").split("?")[0]?.replace(/\/+$/, "") || "";
  return path === "/download";
}

/**
 * Send leftover `#/download` bookmarks to the public site download page.
 * Returns true when a redirect was initiated.
 */
export function redirectLegacyDownloadHash(): boolean {
  if (typeof window === "undefined" || !isLegacyDownloadHash()) return false;
  window.location.replace(PORTAL.download);
  return true;
}
