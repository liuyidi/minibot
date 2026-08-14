import type { AuthConfigResponse } from "@/lib/types";

import type { LocalProfile } from "./storage";

export type ProfileAccount = {
  displayName: string;
  userId: string;
  createdAt: string;
  email: string | null;
  picture: string | null;
  githubBound: boolean;
  githubDisplayName: string;
};

export type ResolveProfileAccountOptions = {
  fallbackName: string;
  /** When false, skip the product fallback so auth can load without a name flash. */
  allowFallback?: boolean;
};

export function resolveProfileAccount(
  local: LocalProfile,
  auth: AuthConfigResponse["account"] | null | undefined,
  fallbackNameOrOptions: string | ResolveProfileAccountOptions,
): ProfileAccount {
  const options =
    typeof fallbackNameOrOptions === "string"
      ? { fallbackName: fallbackNameOrOptions, allowFallback: true }
      : {
          fallbackName: fallbackNameOrOptions.fallbackName,
          allowFallback: fallbackNameOrOptions.allowFallback !== false,
        };
  const authName = auth?.name?.trim() || auth?.email?.trim() || "";
  const localName = local.displayName?.trim() || "";
  const fallback = options.allowFallback ? options.fallbackName : "";
  return {
    displayName: localName || authName || fallback,
    userId: auth?.id?.trim() || local.localUserId,
    createdAt: auth?.created_at?.trim() || local.createdAt,
    email: auth?.email?.trim() || null,
    picture: auth?.picture?.trim() || null,
    githubBound: auth?.github_bound === "true",
    githubDisplayName: auth?.github_display_name?.trim() || "",
  };
}

export function formatProfileDate(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const isoDay = value.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return isoDay;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}
