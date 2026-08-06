import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  readShellRoute,
  shellRouteFromLocation,
  shellRouteToLocation,
} from "@/components/shell/shell-route";

/**
 * React Router 7 hash history listens to `popstate`, not `hashchange`.
 * Tests (and some host embeds) update the hash via `replaceState` + `hashchange`.
 * Sync those external hash edits into the router.
 */
export function HashChangeSync() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const onHashChange = () => {
      const fromWindow = readShellRoute();
      const fromRouter = shellRouteFromLocation(location);
      if (
        fromWindow.view === fromRouter.view &&
        fromWindow.activeKey === fromRouter.activeKey &&
        fromWindow.settingsSection === fromRouter.settingsSection
      ) {
        return;
      }
      const target = shellRouteToLocation(fromWindow);
      navigate(
        { pathname: target.pathname, search: target.search },
        { replace: true },
      );
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [location, navigate]);

  return null;
}
