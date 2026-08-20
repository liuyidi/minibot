import type { DeviceFlowClient } from "./client.js";
import { DeviceFlowError } from "./client.js";
import { sleep } from "../../utils/sleep.js";

export async function pollDeviceToken(client: DeviceFlowClient, deviceCode: string, intervalSeconds: number) {
  const intervalMs = Math.max(1, intervalSeconds) * 1000;
  let currentIntervalMs = intervalMs;

  while (true) {
    try {
      return await client.pollDeviceToken(deviceCode);
    } catch (error) {
      const code = error instanceof DeviceFlowError ? error.code : "";
      if (code === "authorization_pending") {
        await sleep(currentIntervalMs);
        continue;
      }
      if (code === "slow_down") {
        currentIntervalMs += 5000;
        await sleep(currentIntervalMs);
        continue;
      }
      if (code === "expired_token") {
        throw new DeviceFlowError(code, "Device code expired. Please run `minibot login` again.");
      }
      throw error;
    }
  }
}
