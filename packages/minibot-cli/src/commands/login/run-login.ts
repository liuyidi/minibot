import chalk from "chalk";
import ora from "ora";
import { createDeviceFlowClient } from "../../auth/device/client.js";
import { loadEnv } from "../../config/env.js";
import { getSessionStore } from "../../auth/session/store.js";
import { openVerificationUrl } from "../../output/open-browser.js";
import { printVerification } from "../../auth/device/print-verification.js";
import { pollDeviceToken } from "../../auth/device/poll-device-token.js";
import { startDeviceFlow } from "../../auth/device/start-device-flow.js";

export type LoginOptions = {
  authBaseUrl?: string;
  clientId?: string;
  configDir?: string;
  openBrowser?: boolean;
  quiet?: boolean;
};

export async function runLogin(options: LoginOptions = {}): Promise<void> {
  const env = loadEnv(process.env);
  const authBaseUrl = options.authBaseUrl ?? env.authBaseUrl;
  const clientId = options.clientId ?? "minibot";
  const store = getSessionStore(options.configDir || env.configDir || undefined);
  const client = createDeviceFlowClient(authBaseUrl, clientId, {
    location: env.deviceLocation || undefined
  });

  const spinner = ora(options.quiet ? { text: "Starting device login...", isSilent: true } : "Starting device login...").start();
  const device = await startDeviceFlow(client);

  spinner.succeed("Device code created");
  printVerification(device);

  const verificationUrl = device.verificationUriComplete ?? `${device.verificationUri}?user_code=${encodeURIComponent(device.userCode)}`;
  if (options.openBrowser !== false) {
    try {
      await openVerificationUrl(verificationUrl);
      if (!options.quiet) {
        console.log(chalk.gray("Opened verification page in your browser."));
      }
    } catch {
      console.log(chalk.gray("Could not open browser automatically. Please open the URL above manually."));
    }
  }

  const pollSpinner = ora(options.quiet ? { text: "Waiting for authorization in browser...", isSilent: true } : "Waiting for authorization in browser...").start();
  const token = await pollDeviceToken(client, device.deviceCode, device.interval);
  pollSpinner.succeed("Authorized");

  await store.save({
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    tokenType: token.tokenType,
    expiresAt: Date.now() + token.expiresIn * 1000,
    subject: token.subject,
    email: token.email
  });
  console.log(chalk.green("Logged in successfully."));
}
