import { describe, expect, it } from "vitest";

import {
  customMcpFormToUpsertBody,
  DEFAULT_CUSTOM_MCP_FORM,
  parseMcpConfigImport,
} from "@/lib/skills/mcp-config-import";

describe("mcp-config-import", () => {
  it("builds a stdio upsert body from the custom form", () => {
    const body = customMcpFormToUpsertBody({
      ...DEFAULT_CUSTOM_MCP_FORM,
      name: "docs",
      command: "npx",
      args: '["-y","docs-mcp"]',
      env: '{"TOKEN":"x"}',
      toolTimeout: "45",
    });
    expect(body).toEqual({
      id: "docs",
      label: "docs",
      enabled: true,
      type: "stdio",
      command: "npx",
      args: ["-y", "docs-mcp"],
      url: "",
      env: { TOKEN: "x" },
      headers: {},
      tool_timeout: 45,
    });
  });

  it("builds an HTTP upsert body with headers", () => {
    const body = customMcpFormToUpsertBody({
      ...DEFAULT_CUSTOM_MCP_FORM,
      name: "remote",
      transport: "streamableHttp",
      url: "https://example.com/mcp",
      headers: '{"Authorization":"Bearer t"}',
    });
    expect(body.type).toBe("streamableHttp");
    expect(body.url).toBe("https://example.com/mcp");
    expect(body.headers).toEqual({ Authorization: "Bearer t" });
    expect(body.command).toBe("");
  });

  it("parses mcpServers import payloads", () => {
    const bodies = parseMcpConfigImport(
      JSON.stringify({
        mcpServers: {
          docs: { command: "npx", args: ["-y", "docs-mcp"], env: { A: "1" } },
          remote: { url: "https://example.com/sse", headers: { X: "y" } },
        },
      }),
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      id: "docs",
      type: "stdio",
      command: "npx",
      args: ["-y", "docs-mcp"],
      env: { A: "1" },
    });
    expect(bodies[1]).toMatchObject({
      id: "remote",
      type: "sse",
      url: "https://example.com/sse",
      headers: { X: "y" },
    });
  });

  it("rejects invalid mcp.json", () => {
    expect(() => parseMcpConfigImport("{}")).toThrow(/mcpServers/);
    expect(() =>
      customMcpFormToUpsertBody({
        ...DEFAULT_CUSTOM_MCP_FORM,
        name: "x",
        command: "npx",
        args: "{}",
      }),
    ).toThrow(/Args/);
  });
});
