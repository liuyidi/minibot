import { z } from "zod";

const envSchema = z.object({
  MINIBOT_AUTH_URL: z.string().url().optional(),
  MINIBOT_API_URL: z.string().url().optional(),
  MINIBOT_CONFIG_DIR: z.string().min(1).optional(),
  MINIBOT_DEVICE_LOCATION: z.string().min(1).optional(),
  NO_COLOR: z.string().optional()
});

export type MinibotEnv = {
  authBaseUrl: string;
  configDir: string;
  deviceLocation: string;
  noColor: boolean;
};

export function loadEnv(rawEnv: Record<string, string | undefined>): MinibotEnv {
  const env = envSchema.parse(rawEnv);
  const authBaseUrl = env.MINIBOT_AUTH_URL ?? env.MINIBOT_API_URL ?? "https://auth.liuyidi.me";

  return {
    authBaseUrl,
    configDir: env.MINIBOT_CONFIG_DIR ?? "",
    deviceLocation: env.MINIBOT_DEVICE_LOCATION ?? "",
    noColor: env.NO_COLOR !== undefined
  };
}
