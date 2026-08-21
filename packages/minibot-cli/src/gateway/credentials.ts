import { getSessionStore } from "../auth/session/store.js";
import type { MinibotSession } from "../auth/session/types.js";

export type CredentialPath = "secret" | "session" | "anonymous";

export type ResolvedCredentials = {
  path: CredentialPath;
  secret?: string;
  accessToken?: string;
  session?: MinibotSession;
};

export type ResolveCredentialsOptions = {
  secret?: string;
  configDir?: string;
  now?: number;
};

export async function resolveCredentials(
  options: ResolveCredentialsOptions = {}
): Promise<ResolvedCredentials> {
  const secret = (options.secret || "").trim();
  if (secret) {
    return { path: "secret", secret };
  }

  const store = getSessionStore(options.configDir);
  const session = await store.load();
  const now = options.now ?? Date.now();
  if (session && session.accessToken && session.expiresAt > now) {
    return {
      path: "session",
      accessToken: session.accessToken,
      session
    };
  }

  return { path: "anonymous" };
}

export function credentialPathLabel(path: CredentialPath): string {
  switch (path) {
    case "secret":
      return "gateway secret (--secret / MINIBOT_AUTH_SECRET)";
    case "session":
      return "mini-auth login session";
    case "anonymous":
      return "anonymous (open gateway auth)";
  }
}
