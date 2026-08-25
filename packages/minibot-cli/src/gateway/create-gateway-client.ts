import { createClient, type MinibotClient } from "@liuyidi/minibot-client";
import type { ResolvedCredentials } from "./credentials.js";

export type CreateGatewayClientOptions = {
  baseUrl: string;
  credentials: ResolvedCredentials;
};

/**
 * Wire CLI credentials into ``@liuyidi/minibot-client``.
 * Secret wins; otherwise mini-auth access token is sent as Bearer (Phase B).
 */
export function createGatewayClient(options: CreateGatewayClientOptions): MinibotClient {
  const secret = options.credentials.secret;
  const accessToken = options.credentials.accessToken;
  return createClient({
    baseUrl: options.baseUrl,
    getSecret: secret ? () => secret : undefined,
    getAccessToken: !secret && accessToken ? () => accessToken : undefined,
    reconnect: false
  });
}
