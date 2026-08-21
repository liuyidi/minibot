import { z } from "zod";

const envSchema = z.object({
  MINIBOT_AUTH_URL: z.string().url().optional(),
  MINIBOT_API_URL: z.string().url().optional(),
  MINIBOT_AUTH_SECRET: z.string().min(1).optional(),
  MINIBOT_CONFIG_DIR: z.string().min(1).optional(),
  MINIBOT_DEVICE_LOCATION: z.string().min(1).optional(),
  NO_COLOR: z.string().optional()
});

export type MinibotEnv = {
  authBaseUrl: string;
  gatewayBaseUrl: string;
  authSecret: string;
  configDir: string;
  deviceLocation: string;
  noColor: boolean;
};

export function loadEnv(rawEnv: Record<string, string | undefined>): MinibotEnv {
  const env = envSchema.parse(rawEnv);

  return {
    authBaseUrl: env.MINIBOT_AUTH_URL ?? "https://auth.liuyidi.me",
    gatewayBaseUrl: env.MINIBOT_API_URL ?? "http://127.0.0.1:8766",
    authSecret: env.MINIBOT_AUTH_SECRET ?? "",
    configDir: env.MINIBOT_CONFIG_DIR ?? "",
    deviceLocation: env.MINIBOT_DEVICE_LOCATION ?? "",
    noColor: env.NO_COLOR !== undefined
  };
}
