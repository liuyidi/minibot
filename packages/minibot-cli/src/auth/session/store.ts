import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { getSessionFilePath } from "../../config/paths.js";
import { sessionSchema, type MinibotSession } from "./types.js";

export function getSessionStore(customConfigDir?: string) {
  const filePath = getSessionFilePath(customConfigDir);

  return {
    async save(session: MinibotSession): Promise<void> {
      const parsed = sessionSchema.parse(session);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(parsed, null, 2), "utf8");
    },
    async load(): Promise<MinibotSession | null> {
      try {
        const text = await readFile(filePath, "utf8");
        return sessionSchema.parse(JSON.parse(text));
      } catch {
        return null;
      }
    },
    async clear(): Promise<boolean> {
      try {
        await rm(filePath, { force: true });
        return true;
      } catch {
        return false;
      }
    }
  };
}
