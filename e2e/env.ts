import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const candidates = [".env.e2e", ".env"];

for (const filename of candidates) {
  const path = resolve(process.cwd(), filename);
  if (existsSync(path)) {
    config({ path });
    break;
  }
}
