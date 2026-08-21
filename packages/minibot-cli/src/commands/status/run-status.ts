import chalk from "chalk";
import { ApiError } from "@minibot/client";
import { loadEnv } from "../../config/env.js";
import { getSessionStore } from "../../auth/session/store.js";
import {
  credentialPathLabel,
  resolveCredentials
} from "../../gateway/credentials.js";
import { createGatewayClient } from "../../gateway/create-gateway-client.js";
import { printGatewayHint } from "../../gateway/errors.js";
import { resolveSecretOption } from "../../gateway/secret-option.js";

export type StatusOptions = {
  baseUrl?: string;
  secret?: string | boolean;
  configDir?: string;
};

export async function runStatus(options: StatusOptions = {}): Promise<void> {
  const env = loadEnv(process.env);
  const configDir = options.configDir || env.configDir || undefined;
  const baseUrl = (options.baseUrl || env.gatewayBaseUrl).replace(/\/$/, "");
  const secretFlagPresent = options.secret !== undefined;
  const secret = resolveSecretOption(options.secret) || env.authSecret || undefined;

  const store = getSessionStore(configDir);
  const session = await store.load();
  const credentials = await resolveCredentials({ secret, configDir });

  console.log(chalk.bold("minibot status\n"));

  console.log(chalk.cyan("Auth session"));
  if (!session) {
    console.log("  Logged in: no");
  } else {
    const expiresInMs = session.expiresAt - Date.now();
    const expired = expiresInMs <= 0;
    console.log(`  Logged in: ${expired ? "expired" : "yes"}`);
    if (session.email) console.log(`  Email: ${session.email}`);
    if (session.subject) console.log(`  Subject: ${session.subject}`);
    console.log(`  Expires in: ${expired ? "0m" : `${Math.floor(expiresInMs / 60000)}m`}`);
  }

  console.log();
  console.log(chalk.cyan("Gateway"));
  console.log(`  Base URL: ${baseUrl}`);
  console.log(`  Credential path: ${credentialPathLabel(credentials.path)}`);
  if (secretFlagPresent && credentials.path !== "secret") {
    console.log(
      chalk.yellow(
        "  Warning: --secret had no value and MINIBOT_AUTH_SECRET is empty; using login session instead."
      )
    );
  }
  if (credentials.path === "session") {
    console.log(chalk.gray("  Using mini-auth access token as Authorization Bearer for bootstrap."));
  }

  const client = createGatewayClient({ baseUrl, credentials });

  try {
    const health = await client.health();
    console.log(`  Health: ok (${health.status}${health.runtime ? `, ${health.runtime}` : ""})`);
  } catch (err) {
    console.log(chalk.red(`  Health: fail (${err instanceof Error ? err.message : String(err)})`));
    printGatewayHint(baseUrl);
    process.exitCode = 1;
    return;
  }

  try {
    await client.bootstrap();
    console.log("  Bootstrap: ok");
  } catch (err) {
    const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Bootstrap: fail (${detail})`));
    if (err instanceof ApiError && err.status === 401) {
      if (credentials.path === "session") {
        console.log(
          chalk.gray(
            "  Tip: local gateway must run Bearer-bootstrap and the same mini-auth issuer as login."
          )
        );
        console.log(
          chalk.gray(
            "  Example: MINIBOT_SERVER_AUTH_PROVIDER=mini_auth MINIBOT_SERVER_MINI_AUTH_BASE_URL=https://auth.liuyidi.me uv run minibot"
          )
        );
        console.log(
          chalk.gray(
            "  Local CLI override: MINIBOT_API_URL=http://127.0.0.1:8766 minibot status"
          )
        );
      } else {
        console.log(chalk.gray("  Tip: check --secret / MINIBOT_AUTH_SECRET, or minibot login."));
      }
    }
    process.exitCode = 1;
  }
}
