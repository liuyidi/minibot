import cac from "cac";
import { loginCommand } from "../login/command.js";
import { logoutCommand } from "../logout/command.js";
import { whoamiCommand } from "../whoami/command.js";

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

  cli.version("0.1.0");
  cli.option("--config-dir <dir>", "Override the minibot config directory");
  cli.help();
  return cli;
}
