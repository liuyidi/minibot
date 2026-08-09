/** Atomic delete ranges and caret padding for composer @ / skill chips. */

import {
  splitCapabilityMentionSegments,
  type CapabilityMentionSegment,
} from "@/components/thread/CliAppMentionText";
import type { CliAppInfo, McpPresetInfo, SkillSummary } from "@/lib/types";

/**
 * En-spaces after a chip so the caret sits past the pill shadow.
 * Tune `@` and `/` separately — `@` logos are usually a bit narrower than `/` hammers.
 * Each `\u2002` ≈ 0.5em (~7px at 14px).
 */
export const MENTION_AT_CHIP_CARET_PAD = "\u2002\u2002\u2002";
export const MENTION_SLASH_CHIP_CARET_PAD = "\u2002\u2002\u2002\u2002";

/** @deprecated Use {@link MENTION_SLASH_CHIP_CARET_PAD} / {@link MENTION_AT_CHIP_CARET_PAD}. */
export const MENTION_CHIP_CARET_PAD = MENTION_SLASH_CHIP_CARET_PAD;

export function mentionChipCaretPadForToken(token: string): string {
  return token.startsWith("@") ? MENTION_AT_CHIP_CARET_PAD : MENTION_SLASH_CHIP_CARET_PAD;
}

/** `@name` / `/skill` plus caret pad and a normal trailing space for typing. */
export function withMentionChipSuffix(
  token: string,
  options?: { trailingSpace?: boolean },
): string {
  const trailingSpace = options?.trailingSpace !== false;
  return `${token}${mentionChipCaretPadForToken(token)}${trailingSpace ? " " : ""}`;
}

/** Remove composer-only caret pads before sending to the agent. */
export function stripMentionChipPads(text: string): string {
  return text.replaceAll("\u2002", "");
}

export function findAtomicMentionDeleteRange(
  value: string,
  caret: number,
  cliApps: CliAppInfo[],
  mcpPresets: McpPresetInfo[],
  skills: SkillSummary[],
): { start: number; end: number } | null {
  if (caret <= 0 || caret > value.length) return null;
  const segments = splitCapabilityMentionSegments(value, cliApps, mcpPresets, skills);
  let pos = 0;
  for (const segment of segments) {
    const start = pos;
    const end = pos + segment.text.length;
    if (segment.kind !== "text") {
      const range = atomicRangeForToken(value, caret, start, end);
      if (range) return range;
    }
    pos = end;
  }
  return null;
}

function chipSuffixEnd(value: string, tokenEnd: number): number {
  let i = tokenEnd;
  while (i < value.length && value[i] === "\u2002") i += 1;
  if (value[i] === " ") i += 1;
  return i;
}

function atomicRangeForToken(
  value: string,
  caret: number,
  start: number,
  end: number,
): { start: number; end: number } | null {
  const suffixEnd = chipSuffixEnd(value, end);
  // Caret inside token, in the caret-pad, or on the trailing space → remove chip.
  if (caret > start && caret <= suffixEnd) {
    return { start, end: suffixEnd };
  }
  return null;
}

export function segmentsHaveChips(segments: CapabilityMentionSegment[]): boolean {
  return segments.some((segment) => segment.kind !== "text");
}
