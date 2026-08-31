import type { ShellView } from "@/routes/shell-route";

/** Capability hub top-level views (experts / skills / connectors). */
export type CapabilityHubView = Extract<ShellView, "experts" | "skills" | "connectors">;

export const CAPABILITY_HUB_VIEWS: CapabilityHubView[] = ["experts", "skills", "connectors"];

export function isCapabilityHubView(view: string): view is CapabilityHubView {
  return view === "experts" || view === "skills" || view === "connectors";
}
