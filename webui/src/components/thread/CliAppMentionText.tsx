import { RESERVED_SLASH_COMMAND_NAMES } from "@/lib/chat/slashSkills";
import type { CliAppInfo, McpPresetInfo, SkillSummary } from "@/lib/types";

import {
  CliAppMentionToken,
  McpPresetMentionToken,
  SkillMentionToken,
} from "./MentionTokens";

export {
  CliAppMentionToken,
  McpPresetMentionToken,
  SkillMentionToken,
  cliAppInitials,
  mcpPresetInitials,
} from "./MentionTokens";

function syntheticSkill(name: string): SkillSummary {
  return {
    name,
    description: "",
    source: "unknown",
    available: true,
  };
}

export type CliAppMentionSegment =
  | { kind: "text"; text: string }
  | { kind: "cli"; text: string; app: CliAppInfo };

export type CapabilityMentionSegment =
  | CliAppMentionSegment
  | { kind: "mcp"; text: string; preset: McpPresetInfo }
  | { kind: "skill"; text: string; skill: SkillSummary };

type TokenHit =
  | { kind: "cli"; start: number; end: number; app: CliAppInfo }
  | { kind: "mcp"; start: number; end: number; preset: McpPresetInfo }
  | { kind: "skill"; start: number; end: number; skill: SkillSummary };

export function splitCliAppMentionSegments(
  value: string,
  cliApps: CliAppInfo[],
): CliAppMentionSegment[] {
  return splitCapabilityMentionSegments(value, cliApps).filter(
    (segment): segment is CliAppMentionSegment =>
      segment.kind === "text" || segment.kind === "cli",
  );
}

export function splitCapabilityMentionSegments(
  value: string,
  cliApps: CliAppInfo[],
  mcpPresets: McpPresetInfo[] = [],
  skills: SkillSummary[] = [],
): CapabilityMentionSegment[] {
  if (!value) return [];
  const cliAppsByName = new Map(
    cliApps
      .filter((app) => app.installed)
      .map((app) => [app.name.toLowerCase(), app]),
  );
  const mcpPresetsByName = new Map(
    mcpPresets
      .filter((preset) => preset.installed && preset.configured)
      .map((preset) => [preset.name.toLowerCase(), preset]),
  );
  const skillsByName = new Map(
    skills
      .filter((skill) => skill.available !== false)
      .filter((skill) => !RESERVED_SLASH_COMMAND_NAMES.has(skill.name.toLowerCase()))
      .map((skill) => [skill.name.toLowerCase(), skill]),
  );

  const hits: TokenHit[] = [];
  const mentionRe = /(^|[\s([{])@([a-z0-9_-]+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = mentionRe.exec(value)) !== null) {
    const prefix = match[1] ?? "";
    const name = match[2] ?? "";
    const key = name.toLowerCase();
    const app = cliAppsByName.get(key);
    const preset = app ? null : mcpPresetsByName.get(key);
    if (!app && !preset) continue;
    const start = match.index + prefix.length;
    const end = start + name.length + 1;
    if (app) hits.push({ kind: "cli", start, end, app });
    else if (preset) hits.push({ kind: "mcp", start, end, preset });
  }

  // When the skills catalog is unavailable, still chip non-reserved `/name` tokens
  // so message bubbles can render Cursor-style skill pills.
  const allowSyntheticSkills = skills.length === 0;
  const skillRe = /(^|[\s([{])\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\b/g;
  while ((match = skillRe.exec(value)) !== null) {
    const prefix = match[1] ?? "";
    const name = match[2] ?? "";
    const key = name.toLowerCase();
    if (RESERVED_SLASH_COMMAND_NAMES.has(key)) continue;
    const skill = skillsByName.get(key)
      ?? (allowSyntheticSkills ? syntheticSkill(name) : undefined);
    if (!skill) continue;
    const start = match.index + prefix.length;
    const end = start + name.length + 1;
    hits.push({ kind: "skill", start, end, skill });
  }

  if (hits.length === 0) {
    return [{ kind: "text", text: value }];
  }

  hits.sort((a, b) => a.start - b.start || a.end - b.end);
  const segments: CapabilityMentionSegment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) {
      segments.push({ kind: "text", text: value.slice(cursor, hit.start) });
    }
    const text = value.slice(hit.start, hit.end);
    if (hit.kind === "cli") segments.push({ kind: "cli", text, app: hit.app });
    else if (hit.kind === "mcp") segments.push({ kind: "mcp", text, preset: hit.preset });
    else segments.push({ kind: "skill", text, skill: hit.skill });
    cursor = hit.end;
  }
  if (cursor < value.length) {
    segments.push({ kind: "text", text: value.slice(cursor) });
  }
  return segments.length ? segments : [{ kind: "text", text: value }];
}

export function CliAppMentionText({
  text,
  cliApps,
  mcpPresets = [],
  skills = [],
}: {
  text: string;
  cliApps: CliAppInfo[];
  mcpPresets?: McpPresetInfo[];
  skills?: SkillSummary[];
}) {
  const segments = splitCapabilityMentionSegments(text, cliApps, mcpPresets, skills);
  if (!segments.some((segment) => segment.kind !== "text")) return <>{text}</>;
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          return <span key={`text-${index}`}>{segment.text}</span>;
        }
        if (segment.kind === "cli") {
          return (
            <CliAppMentionToken
              key={`cli-${segment.app.name}-${index}`}
              app={segment.app}
              label={segment.text}
              variant="message"
            />
          );
        }
        if (segment.kind === "mcp") {
          return (
            <McpPresetMentionToken
              key={`mcp-${segment.preset.name}-${index}`}
              preset={segment.preset}
              label={segment.text}
              variant="message"
            />
          );
        }
        return (
          <SkillMentionToken
            key={`skill-${segment.skill.name}-${index}`}
            skill={segment.skill}
            label={segment.text}
            variant="message"
          />
        );
      })}
    </>
  );
}
