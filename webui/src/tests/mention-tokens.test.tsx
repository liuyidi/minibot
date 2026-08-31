import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CliAppMentionToken,
  McpPresetMentionToken,
  SkillMentionToken,
} from "@/components/thread/composer/MentionTokens";
import type { CliAppInfo, McpPresetInfo, SkillSummary } from "@/lib/types";

const SKILL: SkillSummary = {
  name: "clawhub",
  description: "ClawHub",
  source: "builtin",
  available: true,
};

const CLI: CliAppInfo = {
  name: "blender",
  display_name: "Blender",
  category: "apps",
  description: "",
  entry_point: "blender",
  installed: true,
  logo_url: null,
  brand_color: "#111827",
};

const MCP: McpPresetInfo = {
  name: "browserbase",
  display_name: "Browserbase",
  description: "",
  installed: true,
  configured: true,
  logo_url: null,
  brand_color: "#111827",
};

describe("composer mention chips", () => {
  it("shows the full skill name and does not clamp the pill to the token spacer", () => {
    render(
      <SkillMentionToken skill={SKILL} label="/clawhub" variant="composer" />,
    );
    const root = screen.getByTestId("composer-skill-mention-clawhub");
    expect(root).toHaveTextContent("clawhub");
    const pill = root.querySelector(".absolute");
    expect(pill).toBeTruthy();
    // max-w-full would lock the pill to the invisible `/clawhub` spacer width.
    expect(pill?.className).not.toMatch(/\bmax-w-full\b/);
  });

  it("keeps the soft 12rem truncate for long names", () => {
    render(
      <SkillMentionToken skill={SKILL} label="/clawhub" variant="composer" />,
    );
    expect(screen.getByText("clawhub").className).toMatch(/max-w-\[12rem]/);
    expect(screen.getByText("clawhub").className).toMatch(/\btruncate\b/);
  });

  it("applies the same overlay rules to @ CLI and MCP chips", () => {
    const { rerender } = render(
      <CliAppMentionToken app={CLI} label="@blender" variant="composer" />,
    );
    expect(
      screen.getByTestId("composer-cli-mention-blender").querySelector(".absolute")
        ?.className,
    ).not.toMatch(/\bmax-w-full\b/);
    expect(screen.getByText("blender")).toBeInTheDocument();

    rerender(
      <McpPresetMentionToken preset={MCP} label="@browserbase" variant="composer" />,
    );
    expect(
      screen.getByTestId("composer-mcp-mention-browserbase").querySelector(".absolute")
        ?.className,
    ).not.toMatch(/\bmax-w-full\b/);
    expect(screen.getByText("browserbase")).toBeInTheDocument();
  });
});
