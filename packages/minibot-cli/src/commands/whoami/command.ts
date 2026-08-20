import chalk from "chalk";
import { getSessionStore } from "../../auth/session/store.js";
import { loadEnv } from "../../config/env.js";

export async function whoamiCommand(): Promise<void> {
  const env = loadEnv(process.env);
  const store = getSessionStore(env.configDir || undefined);
  const session = await store.load();

  if (!session) {
    console.log(chalk.yellow("Not logged in."));
    return;
  }

  console.log(chalk.green("Logged in"));
  const expiresInMs = session.expiresAt - Date.now();
  const expiresInMinutes = Math.max(0, Math.floor(expiresInMs / 60000));
  if (session.email) {
    console.log(`Email: ${session.email}`);
  }
  if (session.subject) {
    console.log(`Subject: ${session.subject}`);
  }
  console.log(`Token type: ${session.tokenType}`);
  console.log(`Expires in: ${expiresInMinutes}m`);
}
