import { runLogin } from "./run-login.js";

export type LoginCommandOptions = {
  authUrl?: string;
  configDir?: string;
  noOpen?: boolean;
  quiet?: boolean;
};

export async function loginCommand(options: LoginCommandOptions = {}): Promise<void> {
  await runLogin({
    authBaseUrl: options.authUrl,
    configDir: options.configDir,
    openBrowser: !options.noOpen,
    quiet: options.quiet
  });
}
