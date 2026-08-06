import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  shellRouteFromLocation,
  shellRouteToLocation,
  type ShellRoute,
} from "@/routes/shell-route";

export type NavigateShellOptions = {
  replace?: boolean;
};

/**
 * Semantic shell navigation: URL ↔ ShellRoute + navigate(ShellRoute).
 */
export function useShellNavigate() {
  const location = useLocation();
  const routerNavigate = useNavigate();

  const route = useMemo(
    () => shellRouteFromLocation(location),
    [location.pathname, location.search],
  );

  const navigate = useCallback(
    (next: ShellRoute, options?: NavigateShellOptions) => {
      const target = shellRouteToLocation(next);
      routerNavigate(
        { pathname: target.pathname, search: target.search },
        { replace: options?.replace },
      );
    },
    [routerNavigate],
  );

  return { route, navigate, location };
}
