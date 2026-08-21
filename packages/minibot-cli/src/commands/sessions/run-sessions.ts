import chalk from "chalk";
import { loadEnv } from "../../config/env.js";
import { resolveCredentials } from "../../gateway/credentials.js";
import { createGatewayClient } from "../../gateway/create-gateway-client.js";
import { handleClientError } from "../../gateway/errors.js";
import { resolveSecretOption } from "../../gateway/secret-option.js";

export type SessionsAction = "list" | "show" | "delete";

export type RunSessionsOptions = {
  action: SessionsAction;
  id?: string;
  baseUrl?: string;
  secret?: string | boolean;
  configDir?: string;
};

export async function runSessions(options: RunSessionsOptions): Promise<void> {
  const env = loadEnv(process.env);
  const configDir = options.configDir || env.configDir || undefined;
  const baseUrl = (options.baseUrl || env.gatewayBaseUrl).replace(/\/$/, "");
  const secret = resolveSecretOption(options.secret) || env.authSecret || undefined;
  const credentials = await resolveCredentials({ secret, configDir });
  const client = createGatewayClient({ baseUrl, credentials });

  try {
    await client.bootstrap();

    if (options.action === "list") {
      const sessions = await client.sessions.list();
      if (sessions.length === 0) {
        console.log(chalk.gray("No sessions."));
        return;
      }
      for (const s of sessions) {
        const title = s.title || "(untitled)";
        const updated = s.updated_at || s.created_at || "";
        console.log(`${s.id}\t${title}${updated ? `\t${updated}` : ""}`);
      }
      return;
    }

    if (!options.id) {
      console.error(chalk.red("Session id is required."));
      process.exit(1);
    }

    if (options.action === "show") {
      const thread = await client.sessions.getThread(options.id);
      if (!thread) {
        console.error(chalk.red(`Session not found: ${options.id}`));
        process.exit(1);
      }
      console.log(JSON.stringify(thread, null, 2));
      return;
    }

    await client.sessions.delete(options.id);
    console.log(chalk.green(`Deleted ${options.id}`));
  } catch (err) {
    handleClientError(err);
  }
}
