import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { loadEnv } from "../../config/env.js";
import { resolveCredentials } from "../../gateway/credentials.js";
import { createGatewayClient } from "../../gateway/create-gateway-client.js";
import { handleClientError } from "../../gateway/errors.js";
import { resolveSecretOption } from "../../gateway/secret-option.js";
import { streamTurn, waitForWsOpen } from "./stream-turn.js";

export type RunChatOptions = {
  message?: string;
  session?: string;
  baseUrl?: string;
  secret?: string | boolean;
  configDir?: string;
};

export async function runChat(options: RunChatOptions = {}): Promise<void> {
  const env = loadEnv(process.env);
  const configDir = options.configDir || env.configDir || undefined;
  const baseUrl = (options.baseUrl || env.gatewayBaseUrl).replace(/\/$/, "");
  const secret = resolveSecretOption(options.secret) || env.authSecret || undefined;
  const credentials = await resolveCredentials({ secret, configDir });
  const client = createGatewayClient({ baseUrl, credentials });

  try {
    await client.bootstrap();
    const ws = client.ensureWs();
    await waitForWsOpen(ws);

    let chatId = options.session?.trim() || "";
    if (chatId) {
      ws.attach(chatId);
    } else {
      chatId = await ws.newChat();
      console.error(chalk.gray(`session ${chatId}`));
    }

    const oneShot = options.message?.trim();
    if (oneShot) {
      await streamTurn({ ws, chatId, content: oneShot });
      ws.close();
      return;
    }

    if (!input.isTTY) {
      console.error(chalk.red("Interactive chat requires a TTY. Use `chat -m \"...\"`."));
      process.exit(1);
    }

    const rl = createInterface({ input, output, terminal: true });
    console.error(chalk.gray("Type a message. /exit to quit. Ctrl+C aborts the turn."));

    const onSigInt = () => {
      try {
        ws.abort(chatId);
      } catch {
        // ignore
      }
      console.error(chalk.gray("\n(aborted)"));
    };
    process.on("SIGINT", onSigInt);

    try {
      for (;;) {
        const line = (await rl.question(chalk.cyan("> "))).trim();
        if (!line) continue;
        if (line === "/exit" || line === "/quit") break;
        await streamTurn({ ws, chatId, content: line });
      }
    } finally {
      process.off("SIGINT", onSigInt);
      rl.close();
      ws.close();
    }
  } catch (err) {
    handleClientError(err, baseUrl);
  }
}
