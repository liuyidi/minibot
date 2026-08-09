import { describe, expect, it } from "vitest";

import {
  mergeSlashPaletteCommands,
  RESERVED_SLASH_COMMAND_NAMES,
  skillsToSlashCommands,
} from "@/lib/chat/slashSkills";
import { splitCapabilityMentionSegments } from "@/components/thread/CliAppMentionText";
import type { SkillSummary, SlashCommand } from "@/lib/types";

const SKILLS: SkillSummary[] = [
  {
    name: "skill-creator",
    description: "Create new skills",
    source: "builtin",
    available: true,
  },
  {
    name: "summarize",
    description: "Summarize text",
    source: "builtin",
    available: true,
  },
  {
    name: "history",
    description: "Should be reserved",
    source: "workspace",
    available: true,
  },
  {
    name: "broken",
    description: "Missing deps",
    source: "workspace",
    available: false,
  },
];

describe("slashSkills", () => {
  it("maps available non-reserved skills to slash commands", () => {
    const commands = skillsToSlashCommands(SKILLS);
    expect(commands.map((c) => c.command)).toEqual(["/skill-creator", "/summarize"]);
    expect(commands[0]).toMatchObject({
      title: "skill-creator",
      icon: "hammer",
    });
  });

  it("merges builtins ahead of skills and keeps reserved names out of skills", () => {
    const builtins: SlashCommand[] = [
      {
        command: "/history",
        title: "History",
        description: "Show history",
        icon: "history",
        argHint: "[n]",
      },
    ];
    const merged = mergeSlashPaletteCommands(builtins, SKILLS);
    expect(merged.map((c) => c.command)).toEqual([
      "/history",
      "/skill-creator",
      "/summarize",
    ]);
    expect(RESERVED_SLASH_COMMAND_NAMES.has("history")).toBe(true);
  });

  it("chips /skill tokens and @ mentions as pill segments", () => {
    const segments = splitCapabilityMentionSegments(
      "/skill-creator please use @blender",
      [
        {
          name: "blender",
          display_name: "Blender",
          category: "3d",
          description: "",
          entry_point: "blender",
          installed: true,
          logo_url: null,
          brand_color: null,
        },
      ],
      [],
      SKILLS,
    );
    expect(segments.map((s) => s.kind)).toEqual(["skill", "text", "cli"]);
    expect(segments[0]).toMatchObject({ kind: "skill", text: "/skill-creator" });
    expect(segments[2]).toMatchObject({ kind: "cli", text: "@blender" });
  });

  it("does not chip reserved slash commands even with empty skill catalog", () => {
    const segments = splitCapabilityMentionSegments("/history 5", [], [], []);
    expect(segments).toEqual([{ kind: "text", text: "/history 5" }]);
  });
});
