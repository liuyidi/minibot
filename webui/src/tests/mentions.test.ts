import { describe, expect, it } from "vitest";

import {
  attachmentsFromCapabilitySegments,
  buildMentionCandidates,
  sendOptionsFromAttachments,
  type MentionAttachment,
  wireLegacyMentionsFromAttachments,
} from "@/lib/chat/mentions";
import type { CliAppInfo, McpPresetInfo } from "@/lib/types";
import { splitCapabilityMentionSegments } from "@/components/thread/CliAppMentionText";

const CLI_APPS: CliAppInfo[] = [
  {
    name: "blender",
    display_name: "Blender",
    category: "3d",
    description: "3D tools",
    entry_point: "blender",
    installed: true,
    logo_url: null,
    brand_color: "#f97316",
  },
  {
    name: "figma",
    display_name: "Figma",
    category: "design",
    description: "Design",
    entry_point: "figma",
    installed: false,
    logo_url: null,
    brand_color: null,
  },
];

const MCP_PRESETS: McpPresetInfo[] = [
  {
    name: "browserbase",
    display_name: "Browserbase",
    category: "browser",
    description: "Browser automation",
    transport: "streamableHttp",
    status: "configured",
    installed: true,
    configured: true,
    logo_url: null,
    brand_color: "#111827",
  },
];

describe("mentions Phase 0", () => {
  it("builds unified candidates with kind/id/name/label from CLI + MCP sources", () => {
    const candidates = buildMentionCandidates({
      cliApps: CLI_APPS,
      mcpPresets: MCP_PRESETS,
      query: "",
    });
    expect(candidates.map((c) => ({ kind: c.kind, id: c.id, name: c.name }))).toEqual([
      { kind: "cli", id: "blender", name: "blender" },
      { kind: "mcp", id: "browserbase", name: "browserbase" },
    ]);
    expect(candidates[0]?.label).toBe("Blender");
    expect(candidates[1]?.label).toBe("Browserbase");
  });

  it("filters candidates by query and skips uninstalled/unconfigured sources", () => {
    const candidates = buildMentionCandidates({
      cliApps: CLI_APPS,
      mcpPresets: MCP_PRESETS,
      query: "bro",
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: "mcp", name: "browserbase" });
  });

  it("collects attachments from parsed segments with stable ids", () => {
    const segments = splitCapabilityMentionSegments(
      "use @blender and @browserbase",
      CLI_APPS,
      MCP_PRESETS,
    );
    const attachments = attachmentsFromCapabilitySegments(segments);
    expect(attachments).toEqual<MentionAttachment[]>([
      {
        type: "cli",
        id: "blender",
        name: "blender",
        label: "Blender",
        meta: {
          category: "3d",
          entry_point: "blender",
          logo_url: null,
          brand_color: "#f97316",
        },
      },
      {
        type: "mcp",
        id: "browserbase",
        name: "browserbase",
        label: "Browserbase",
        meta: {
          category: "browser",
          transport: "streamableHttp",
          status: "configured",
          configured: true,
          logo_url: null,
          brand_color: "#111827",
        },
      },
    ]);
  });

  it("expands attachments into legacy wire cliApps/mcpPresets for compatibility", () => {
    const attachments: MentionAttachment[] = [
      {
        type: "cli",
        id: "blender",
        name: "blender",
        label: "Blender",
        meta: { entry_point: "blender", category: "3d" },
      },
      {
        type: "mcp",
        id: "browserbase",
        name: "browserbase",
        label: "Browserbase",
        meta: { transport: "streamableHttp", configured: true, status: "configured" },
      },
    ];
    expect(wireLegacyMentionsFromAttachments(attachments)).toEqual({
      cliApps: [
        {
          name: "blender",
          display_name: "Blender",
          category: "3d",
          entry_point: "blender",
          logo_url: null,
          brand_color: null,
        },
      ],
      mcpPresets: [
        {
          name: "browserbase",
          display_name: "Browserbase",
          category: undefined,
          transport: "streamableHttp",
          status: "configured",
          configured: true,
          logo_url: null,
          brand_color: null,
        },
      ],
    });
  });

  it("builds SendOptions with both attachments and legacy fields", () => {
    const attachments: MentionAttachment[] = [
      {
        type: "mcp",
        id: "browserbase",
        name: "browserbase",
        label: "Browserbase",
        meta: { transport: "streamableHttp", configured: true, status: "ok" },
      },
    ];
    expect(sendOptionsFromAttachments(attachments)).toEqual({
      attachments,
      mcpPresets: [
        {
          name: "browserbase",
          display_name: "Browserbase",
          category: undefined,
          transport: "streamableHttp",
          status: "ok",
          configured: true,
          logo_url: null,
          brand_color: null,
        },
      ],
    });
  });
});
