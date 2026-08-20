import { homedir } from "node:os";
import { join } from "node:path";

export function getConfigDir(customDir?: string): string {
  return customDir ?? join(homedir(), ".minibot");
}

export function getSessionFilePath(customDir?: string): string {
  return join(getConfigDir(customDir), "session.json");
}
