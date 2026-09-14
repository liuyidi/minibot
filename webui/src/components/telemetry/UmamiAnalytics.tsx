import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { identifyUmami, trackUmamiPageview } from "@/lib/telemetry/umami";

/**
 * Sends Umami pageviews on hash/route changes and identifies once when userId is known.
 */
export function UmamiAnalytics({ userId }: { userId?: string | null }) {
  const location = useLocation();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    trackUmamiPageview();
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const id = userId?.trim() || "";
    if (!id || identified.current === id) return;
    identifyUmami(id);
    identified.current = id;
  }, [userId]);

  return null;
}
