import { describe, expect, it } from "vitest";
import { deviceStartResponseSchema, deviceTokenResponseSchema, toDeviceStartResponse, toDeviceTokenResponse } from "./types.js";

describe("device types", () => {
  it("maps device start response", () => {
    const parsed = toDeviceStartResponse(
      deviceStartResponseSchema.parse({
        device_code: "dev",
        user_code: "USER-CODE",
        verification_uri: "https://example.com/device",
        verification_uri_complete: "https://example.com/device?user_code=USER-CODE",
        expires_in: 900,
        interval: 5
      })
    );

    expect(parsed.deviceCode).toBe("dev");
    expect(parsed.userCode).toBe("USER-CODE");
    expect(parsed.verificationUri).toBe("https://example.com/device");
    expect(parsed.verificationUriComplete).toContain("user_code");
  });

  it("maps token response", () => {
    const parsed = toDeviceTokenResponse(
      deviceTokenResponseSchema.parse({
        access_token: "access",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh",
        subject: "sub",
        email: "a@example.com"
      })
    );

    expect(parsed.accessToken).toBe("access");
    expect(parsed.refreshToken).toBe("refresh");
    expect(parsed.subject).toBe("sub");
    expect(parsed.email).toBe("a@example.com");
  });
});
