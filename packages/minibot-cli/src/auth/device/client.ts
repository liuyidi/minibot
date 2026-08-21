import os from "node:os";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  DEVICE_CODE_GRANT_TYPE,
  deviceStartResponseSchema,
  deviceTokenResponseSchema,
  toDeviceStartResponse,
  toDeviceTokenResponse,
  type DeviceStartResponse,
  type DeviceTokenResponse
} from "./types.js";

export type DeviceFlowClient = {
  startDeviceFlow: () => Promise<DeviceStartResponse>;
  pollDeviceToken: (deviceCode: string) => Promise<DeviceTokenResponse>;
};

export type DeviceContext = {
  deviceLabel?: string;
  location?: string;
  userAgent?: string;
};

export class DeviceFlowError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DeviceFlowError";
    this.code = code;
  }
}

function buildDefaultDeviceContext(): DeviceContext {
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const nodeVersion = process.version;
  const packageJson = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
  ) as { version?: string };
  const cliVersion = packageJson.version ?? "0.0.0";
  const userAgent = `${hostname} @ ${cliVersion} ${nodeVersion} ${platform} (${arch})`;

  return {
    deviceLabel: userAgent,
    userAgent
  };
}

export function createDeviceFlowClient(
  apiBaseUrl: string,
  clientId = "minibot",
  deviceContext: DeviceContext = buildDefaultDeviceContext()
): DeviceFlowClient {
  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  const context = { ...buildDefaultDeviceContext(), ...deviceContext };

  return {
    async startDeviceFlow() {
      const response = await fetch(`${baseUrl}/oauth/device/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(context.deviceLabel ? { "x-device-label": context.deviceLabel } : {}),
          ...(context.location ? { "x-device-location": context.location } : {}),
          ...(context.userAgent ? { "user-agent": context.userAgent } : {})
        },
        body: JSON.stringify({
          client_id: clientId,
          scope: "openid profile email offline_access"
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start device flow: ${response.status}`);
      }

      const json = await response.json();
      return toDeviceStartResponse(deviceStartResponseSchema.parse(json));
    },
    async pollDeviceToken(deviceCode: string) {
      const response = await fetch(`${baseUrl}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: DEVICE_CODE_GRANT_TYPE,
          client_id: clientId,
          device_code: deviceCode
        })
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = z
          .object({
            error: z.string().optional(),
            error_description: z.string().optional(),
            detail: z.string().optional()
          })
          .safeParse(json);
        const code = error.success ? error.data.error ?? error.data.detail ?? "token_request_failed" : "token_request_failed";
        const message = error.success
          ? error.data.error_description ?? error.data.detail ?? error.data.error ?? `Token request failed: ${response.status}`
          : `Token request failed: ${response.status}`;
        throw new DeviceFlowError(code, message);
      }

      return toDeviceTokenResponse(deviceTokenResponseSchema.parse(json));
    }
  };
}
