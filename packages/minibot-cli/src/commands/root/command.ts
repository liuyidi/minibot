import cac from "cac";
import { loginCommand } from "../login/command.js";
import { logoutCommand } from "../logout/command.js";
import { whoamiCommand } from "../whoami/command.js";
import { statusCommand } from "../status/command.js";
import { sessionsCommand } from "../sessions/command.js";
import { chatCommand } from "../chat/command.js";

export function createCli() {
  const cli = cac("minibot");

  cli
    .command("login", "Sign in to minibot")
    .option("--auth-url <url>", "Override the minibot auth base URL")
    .option("--config-dir <dir>", "Override the minibot config directory")
    .option("--no-open", "Do not open the browser automatically")
    .option("--quiet", "Reduce terminal output")
    .action(loginCommand);

  cli.command("whoami", "Show the current account").action(whoamiCommand);
  cli.command("logout", "Sign out from minibot").action(logoutCommand);

  cli
    .command("status", "Show auth session and gateway status")
    .option("--base-url <url>", "Gateway base URL")
    .option("--secret [secret]", "Gateway auth secret (omit value to use MINIBOT_AUTH_SECRET)")
    .option("--config-dir <dir>", "Override the minibot config directory")
    .action(statusCommand);

  cli
    .command("sessions list", "List gateway sessions")
    .option("--base-url <url>", "Gateway base URL")
    .option("--secret [secret]", "Gateway auth secret (omit value to use MINIBOT_AUTH_SECRET)")
    .option("--config-dir <dir>", "Override the minibot config directory")
    .action(async (options) => sessionsCommand("list", undefined, options));

  cli
    .command("sessions show <id>", "Show a session thread")
    .option("--base-url <url>", "Gateway base URL")
    .option("--secret [secret]", "Gateway auth secret (omit value to use MINIBOT_AUTH_SECRET)")
    .option("--config-dir <dir>", "Override the minibot config directory")
    .action(async (id: string, options) => sessionsCommand("show", id, options));

  cli
    .command("sessions delete <id>", "Delete a session")
    .option("--base-url <url>", "Gateway base URL")
    .option("--secret [secret]", "Gateway auth secret (omit value to use MINIBOT_AUTH_SECRET)")
    .option("--config-dir <dir>", "Override the minibot config directory")
    .action(async (id: string, options) => sessionsCommand("delete", id, options));

  cli
    .command("chat", "Chat with the gateway agent")
    .option("-m, --message <text>", "Send a single message and exit")
    .option("-s, --session <id>", "Attach to an existing session id")
    .option("--base-url <url>", "Gateway base URL")
    .option("--secret [secret]", "Gateway auth secret (omit value to use MINIBOT_AUTH_SECRET)")
    .option("--config-dir <dir>", "Override the minibot config directory")
    .action(chatCommand);

  cli.version("0.1.0");
  cli.option("--config-dir <dir>", "Override the minibot config directory");
  cli.help();
  return cli;
}
