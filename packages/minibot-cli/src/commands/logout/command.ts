import chalk from "chalk";
import { getSessionStore } from "../../auth/session/store.js";
import { loadEnv } from "../../config/env.js";

export async function logoutCommand(): Promise<void> {
  const env = loadEnv(process.env);
  const store = getSessionStore(env.configDir || undefined);
  const cleared = await store.clear();
  if (cleared) {
    console.log(chalk.green("Logged out."));
    return;
  }
  console.log(chalk.yellow("Not logged in."));
}
