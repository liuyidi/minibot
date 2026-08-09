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

function countLeadingEnSpaces(text: string): number {
  let n = 0;
  while (text[n] === "\u2002") n += 1;
  return n;
}

/**
 * Ensure every recognized `@` / `/` chip has caret pads after it.
 * Palette inserts already include pads; paste / typed plain text often does not,
 * which lets the absolute pill cover the following glyph.
 */
export function ensureMentionChipPadsWithCaret(
  value: string,
  caret: number,
  cliApps: CliAppInfo[],
  mcpPresets: McpPresetInfo[],
  skills: SkillSummary[],
): { value: string; caret: number } {
  const segments = splitCapabilityMentionSegments(value, cliApps, mcpPresets, skills);
  if (!segments.some((segment) => segment.kind !== "text")) {
    return { value, caret };
  }

  let out = "";
  let origin = 0;
  let nextCaret = caret;

  const shiftCaret = (atOrigin: number, delta: number) => {
    if (delta === 0) return;
    // Insertions at/after the caret that belong after the chip should land the
    // caret past the pads so typing continues after the pill.
    if (caret >= atOrigin) nextCaret += delta;
  };

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    if (segment.kind === "text") {
      out += segment.text;
      origin += segment.text.length;
      continue;
    }

    out += segment.text;
    origin += segment.text.length;
    const pad = mentionChipCaretPadForToken(segment.text);
    const next = segments[i + 1];
    if (next?.kind === "text") {
      const leading = countLeadingEnSpaces(next.text);
      const rest = next.text.slice(leading);
      shiftCaret(origin, pad.length - leading);
      out += pad + rest;
      origin += next.text.length;
      i += 1;
      continue;
    }

    shiftCaret(origin, pad.length);
    out += pad;
  }

  return {
    value: out,
    caret: Math.max(0, Math.min(out.length, nextCaret)),
  };
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
