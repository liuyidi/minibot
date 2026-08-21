import { ApiError } from "@minibot/client";
import chalk from "chalk";

export function printGatewayHint(): void {
  console.error(chalk.gray("Hint: start the Python gateway (e.g. `uv run minibot`) then retry."));
}

export function handleClientError(err: unknown): never {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      console.error(chalk.red("Unauthorized (401)."));
      console.error(chalk.gray("Try `minibot login` (after Phase B) or pass `--secret` / MINIBOT_AUTH_SECRET."));
    } else {
      console.error(chalk.red(err.message));
    }
    printGatewayHint();
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(chalk.red(err.message));
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(err.message)) {
      printGatewayHint();
    }
    process.exit(1);
  }
  console.error(chalk.red(String(err)));
  process.exit(1);
}
