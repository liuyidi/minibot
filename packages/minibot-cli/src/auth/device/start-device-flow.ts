import type { DeviceFlowClient } from "./client.js";

export async function startDeviceFlow(client: DeviceFlowClient) {
  return client.startDeviceFlow();
}
