import chalk from "chalk";
import type { DeviceStartResponse } from "./types.js";

export function printVerification(device: DeviceStartResponse): void {
  console.log("");
  console.log(chalk.bold("To sign in, open this page on any device:"));
  console.log(device.verificationUriComplete ?? device.verificationUri);
  console.log("");
  console.log(`User code: ${chalk.cyan(device.userCode)}`);
  console.log("");
}
