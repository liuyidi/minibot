import { describe, expect, it } from "vitest";
import { resolveSecretOption } from "./secret-option.js";

describe("resolveSecretOption", () => {
  it("returns undefined for bare flag / missing", () => {
    expect(resolveSecretOption(true)).toBeUndefined();
    expect(resolveSecretOption(undefined)).toBeUndefined();
  });

  it("returns trimmed string values", () => {
    expect(resolveSecretOption("  abc  ")).toBe("abc");
  });
});
