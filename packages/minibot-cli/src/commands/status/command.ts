import { runStatus } from "./run-status.js";

export type StatusCommandOptions = {
  baseUrl?: string;
  secret?: string | boolean;
  configDir?: string;
};

export async function statusCommand(options: StatusCommandOptions = {}): Promise<void> {
  await runStatus(options);
}
