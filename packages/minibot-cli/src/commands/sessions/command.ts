import { runSessions, type SessionsAction } from "./run-sessions.js";

export type SessionsCommandOptions = {
  baseUrl?: string;
  secret?: string | boolean;
  configDir?: string;
};

export async function sessionsCommand(
  action: SessionsAction,
  id: string | undefined,
  options: SessionsCommandOptions = {}
): Promise<void> {
  await runSessions({ action, id, ...options });
}
