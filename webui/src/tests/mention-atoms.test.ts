import { describe, expect, it } from "vitest";

import {
  ensureMentionChipPadsWithCaret,
  findAtomicMentionDeleteRange,
  MENTION_AT_CHIP_CARET_PAD,
  MENTION_SLASH_CHIP_CARET_PAD,
  withMentionChipSuffix,
} from "@/lib/chat/mentionAtoms";
import type { CliAppInfo, SkillSummary } from "@/lib/types";

const SKILLS: SkillSummary[] = [
  {
    name: "summarize",
    description: "Summarize",
    source: "builtin",
    available: true,
  },
  {
    name: "clawhub",
    description: "ClawHub",
    source: "builtin",
    available: true,
  },
];

const CLI_APPS: CliAppInfo[] = [
  {
    name: "context7",
    display_name: "Context7",
    category: "docs",
    description: "",
    entry_point: "context7",
    installed: true,
    logo_url: null,
    brand_color: "#111827",
  },
];

describe("mention chip caret pad", () => {
  it("uses a shorter pad for @ than for /", () => {
    expect(withMentionChipSuffix("/summarize")).toBe(
      `/summarize${MENTION_SLASH_CHIP_CARET_PAD} `,
    );
    expect(withMentionChipSuffix("@context7")).toBe(
      `@context7${MENTION_AT_CHIP_CARET_PAD} `,
    );
    expect(MENTION_AT_CHIP_CARET_PAD.length).toBeLessThan(
      MENTION_SLASH_CHIP_CARET_PAD.length,
    );
  });

  it("removes skill chip, caret pad, and trailing space together", () => {
    const value = withMentionChipSuffix("/summarize") + "help";
    const caret = withMentionChipSuffix("/summarize").length;
    expect(findAtomicMentionDeleteRange(value, caret, [], [], SKILLS)).toEqual({
      start: 0,
      end: caret,
    });
  });

  it("removes an @ mention chip as one block including caret pad", () => {
    const chip = withMentionChipSuffix("@context7");
    const value = `use ${chip}please`;
    const caret = `use ${chip}`.length;
    expect(findAtomicMentionDeleteRange(value, caret, CLI_APPS, [], [])).toEqual({
      start: "use ".length,
      end: caret,
    });
  });

  it("returns null for ordinary text", () => {
    expect(findAtomicMentionDeleteRange("hello", 5, CLI_APPS, [], SKILLS)).toBeNull();
  });
});

describe("ensureMentionChipPadsWithCaret", () => {
  it("injects slash pads after a pasted skill so following text is not covered", () => {
    const pasted = "/clawhub 安装 summarize";
    const result = ensureMentionChipPadsWithCaret(
      pasted,
      pasted.length,
      [],
      [],
      SKILLS,
    );
    expect(result.value).toBe(`/clawhub${MENTION_SLASH_CHIP_CARET_PAD} 安装 summarize`);
    expect(result.caret).toBe(result.value.length);
  });

  it("is idempotent when pads are already present", () => {
    const value = withMentionChipSuffix("/summarize") + "help";
    const result = ensureMentionChipPadsWithCaret(value, value.length, [], [], SKILLS);
    expect(result.value).toBe(value);
  });

  it("pads @ mentions and leaves non-chip text alone", () => {
    expect(
      ensureMentionChipPadsWithCaret("hello", 5, CLI_APPS, [], SKILLS).value,
    ).toBe("hello");
    expect(
      ensureMentionChipPadsWithCaret("@context7 please", 0, CLI_APPS, [], []).value,
    ).toBe(`@context7${MENTION_AT_CHIP_CARET_PAD} please`);
  });

  it("moves the caret past newly inserted pads", () => {
    const pasted = "/clawhub 安装";
    // Caret right after the skill token (before the space).
    const caret = "/clawhub".length;
    const result = ensureMentionChipPadsWithCaret(pasted, caret, [], [], SKILLS);
    expect(result.value).toBe(`/clawhub${MENTION_SLASH_CHIP_CARET_PAD} 安装`);
    expect(result.caret).toBe(`/clawhub${MENTION_SLASH_CHIP_CARET_PAD}`.length);
  });
});
