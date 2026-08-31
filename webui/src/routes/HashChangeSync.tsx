import { useEffect } from "react";

import { redirectLegacyDownloadHash } from "@/lib/configs/legacy-download-redirect";
import {
  readShellRoute,
  shellRouteFromLocation,
} from "@/routes/shell-route";
import { useShellNavigate } from "@/routes/useShellNavigate";

/**
 * React Router 7 hash history listens to `popstate`, not `hashchange`.
 * Tests (and some host embeds) update the hash via `replaceState` + `hashchange`.
 * Sync those external hash edits into the router.
 */
export function HashChangeSync() {
  const { navigate, location } = useShellNavigate();

  useEffect(() => {
    const onHashChange = () => {
      if (redirectLegacyDownloadHash()) return;
      const fromWindow = readShellRoute();
      const fromRouter = shellRouteFromLocation(location);
      if (
        fromWindow.view === fromRouter.view &&
        fromWindow.activeKey === fromRouter.activeKey &&
        fromWindow.settingsSection === fromRouter.settingsSection
      ) {
        return;
      }
      navigate(fromWindow, { replace: true });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [location, navigate]);

  return null;
}
