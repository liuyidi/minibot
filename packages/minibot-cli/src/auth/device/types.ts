import { z } from "zod";

export const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export const deviceStartResponseSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string().url(),
  verification_uri_complete: z.string().url().optional(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().optional()
});

export type DeviceStartResponse = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
};

export const deviceTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().default("Bearer"),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
  scope: z.string().optional(),
  subject: z.string().optional(),
  email: z.string().email().optional()
});

export type DeviceTokenResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
  subject?: string;
  email?: string;
};

export function toDeviceStartResponse(input: z.infer<typeof deviceStartResponseSchema>): DeviceStartResponse {
  return {
    deviceCode: input.device_code,
    userCode: input.user_code,
    verificationUri: input.verification_uri,
    verificationUriComplete: input.verification_uri_complete,
    expiresIn: input.expires_in,
    interval: input.interval ?? 5
  };
}

export function toDeviceTokenResponse(input: z.infer<typeof deviceTokenResponseSchema>): DeviceTokenResponse {
  return {
    accessToken: input.access_token,
    tokenType: input.token_type,
    expiresIn: input.expires_in,
    refreshToken: input.refresh_token,
    idToken: input.id_token,
    scope: input.scope,
    subject: input.subject,
    email: input.email
  };
}
