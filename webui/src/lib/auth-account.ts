import type { AuthConfigResponse } from "@/lib/types";

export function accountDisplayName(config: AuthConfigResponse | null): string | null {
  const name = config?.account?.name?.trim();
  if (name) return name;
  const email = config?.account?.email?.trim();
  return email || null;
}
