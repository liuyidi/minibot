import { runChat } from "./run-chat.js";

export type ChatCommandOptions = {
  message?: string;
  m?: string;
  session?: string;
  baseUrl?: string;
  secret?: string | boolean;
  configDir?: string;
};

export async function chatCommand(options: ChatCommandOptions = {}): Promise<void> {
  await runChat({
    message: options.message || options.m,
    session: options.session,
    baseUrl: options.baseUrl,
    secret: options.secret,
    configDir: options.configDir
  });
}
