import { ApiError } from "@minibot/client";
import chalk from "chalk";

export function printGatewayHint(baseUrl?: string): void {
  const local =
    !!baseUrl &&
    (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(baseUrl) ||
      baseUrl.includes("127.0.0.1") ||
      baseUrl.includes("localhost"));
  if (local) {
    console.error(chalk.gray("Hint: start the Python gateway (e.g. `uv run minibot`) then retry."));
  } else {
    console.error(
      chalk.gray(
        "Hint: check network / login. For a local gateway: MINIBOT_API_URL=http://127.0.0.1:8766"
      )
    );
  }
}

export function handleClientError(err: unknown, baseUrl?: string): never {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      console.error(chalk.red("Unauthorized (401)."));
      console.error(chalk.gray("Try `minibot login` or pass `--secret` / MINIBOT_AUTH_SECRET."));
    } else {
      console.error(chalk.red(err.message));
    }
    printGatewayHint(baseUrl);
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(chalk.red(err.message));
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(err.message)) {
      printGatewayHint(baseUrl);
    }
    process.exit(1);
  }
  console.error(chalk.red(String(err)));
  process.exit(1);
}
