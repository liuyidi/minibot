import { createCli } from "./commands/index.js";

export async function runCli(argv: string[]): Promise<void> {
  const cli = createCli();
  cli.parse(["node", "minibot", ...argv], { run: true });
}
