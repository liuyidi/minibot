/**
 * Phase 0 mention pipeline: unified candidates + attachments.
 * Wire protocol still sends legacy cli_apps / mcp_presets for compatibility.
 */

import type { CapabilityMentionSegment } from "@/components/thread/composer/CliAppMentionText";
import type {
  CliAppInfo,
  McpPresetInfo,
  OutboundCliAppMention,
  OutboundMcpPresetMention,
} from "@/lib/types";

/** Extensible kinds — Phase 1+ may add skill | kb | file | folder | session. */
export type MentionKind = "cli" | "mcp";

export type MentionAttachment = {
  type: MentionKind;
  id: string;
  name: string;
  label?: string;
  meta?: Record<string, unknown>;
};

export type MentionCandidate = {
  kind: MentionKind;
  id: string;
  name: string;
  label: string;
  meta?: Record<string, unknown>;
} & (
  | { kind: "cli"; app: CliAppInfo }
  | { kind: "mcp"; preset: McpPresetInfo }
);

export type MentionSources = {
  cliApps?: CliAppInfo[];
  mcpPresets?: McpPresetInfo[];
  query?: string;
  /** Max candidates after grouping (default 8). */
  limit?: number;
};

const DEFAULT_LIMIT = 8;
const GROUP_RESERVED: Record<MentionKind, number> = {
  cli: 4,
  mcp: 4,
};

function matchesQuery(haystack: string, query: string): boolean {
  if (!query) return true;
  return haystack.toLowerCase().includes(query.toLowerCase());
}

function cliCandidate(app: CliAppInfo): MentionCandidate {
  return {
    kind: "cli",
    id: app.name,
    name: app.name,
    label: app.display_name || app.name,
    meta: {
      category: app.category,
      entry_point: app.entry_point,
      logo_url: app.logo_url ?? null,
      brand_color: app.brand_color ?? null,
    },
    app,
  };
}

function mcpCandidate(preset: McpPresetInfo): MentionCandidate {
  return {
    kind: "mcp",
    id: preset.name,
    name: preset.name,
    label: preset.display_name || preset.name,
    meta: {
      category: preset.category,
      transport: preset.transport,
      status: preset.status,
      configured: preset.configured,
      logo_url: preset.logo_url ?? null,
      brand_color: preset.brand_color ?? null,
    },
    preset,
  };
}

/** Build grouped mention candidates from local sources (remote search later). */
export function buildMentionCandidates(sources: MentionSources): MentionCandidate[] {
  const query = (sources.query ?? "").trim().toLowerCase();
  const limit = sources.limit ?? DEFAULT_LIMIT;

  const cliCandidates = (sources.cliApps ?? [])
    .filter((app) => app.installed)
    .filter((app) =>
      matchesQuery(
        [app.name, app.display_name, app.category, app.description, app.entry_point].join(" "),
        query,
      ),
    )
    .map(cliCandidate);

  const mcpCandidates = (sources.mcpPresets ?? [])
    .filter((preset) => preset.installed && preset.configured)
    .filter((preset) =>
      matchesQuery(
        [
          preset.name,
          preset.display_name,
          preset.category,
          preset.description,
          preset.transport,
        ].join(" "),
        query,
      ),
    )
    .map(mcpCandidate);

  const groups: Array<{ kind: MentionKind; candidates: MentionCandidate[] }> = [
    { kind: "cli", candidates: cliCandidates },
    { kind: "mcp", candidates: mcpCandidates },
  ];

  let remaining = limit;
  const counts = groups.map(({ kind, candidates }) => {
    const reserved = Math.min(GROUP_RESERVED[kind], candidates.length, remaining);
    remaining -= reserved;
    return reserved;
  });
  for (let index = 0; index < groups.length; index += 1) {
    const extra = Math.min(
      remaining,
      groups[index]!.candidates.length - counts[index]!,
    );
    counts[index]! += extra;
    remaining -= extra;
  }

  return groups.flatMap(({ candidates }, index) => candidates.slice(0, counts[index]));
}

export function attachmentsFromCapabilitySegments(
  segments: CapabilityMentionSegment[],
): MentionAttachment[] {
  const seen = new Set<string>();
  const out: MentionAttachment[] = [];
  for (const segment of segments) {
    if (segment.kind === "text") continue;
    if (segment.kind === "cli") {
      const key = `cli:${segment.app.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        type: "cli",
        id: segment.app.name,
        name: segment.app.name,
        label: segment.app.display_name || segment.app.name,
        meta: {
          category: segment.app.category,
          entry_point: segment.app.entry_point,
          logo_url: segment.app.logo_url ?? null,
          brand_color: segment.app.brand_color ?? null,
        },
      });
      continue;
    }
    if (segment.kind === "mcp") {
      const key = `mcp:${segment.preset.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        type: "mcp",
        id: segment.preset.name,
        name: segment.preset.name,
        label: segment.preset.display_name || segment.preset.name,
        meta: {
          category: segment.preset.category,
          transport: segment.preset.transport,
          status: segment.preset.status,
          configured: segment.preset.configured,
          logo_url: segment.preset.logo_url ?? null,
          brand_color: segment.preset.brand_color ?? null,
        },
      });
    }
  }
  return out;
}

function metaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === "string" ? value : undefined;
}

function metaBool(meta: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = meta?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function metaNullableString(
  meta: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = meta?.[key];
  if (value == null) return null;
  return typeof value === "string" ? value : null;
}

export function wireLegacyMentionsFromAttachments(attachments: MentionAttachment[]): {
  cliApps?: OutboundCliAppMention[];
  mcpPresets?: OutboundMcpPresetMention[];
} {
  const cliApps: OutboundCliAppMention[] = [];
  const mcpPresets: OutboundMcpPresetMention[] = [];
  for (const item of attachments) {
    if (item.type === "cli") {
      cliApps.push({
        name: item.name,
        display_name: item.label || item.name,
        category: metaString(item.meta, "category"),
        entry_point: metaString(item.meta, "entry_point"),
        logo_url: metaNullableString(item.meta, "logo_url"),
        brand_color: metaNullableString(item.meta, "brand_color"),
      });
    } else if (item.type === "mcp") {
      mcpPresets.push({
        name: item.name,
        display_name: item.label || item.name,
        category: metaString(item.meta, "category"),
        transport: metaString(item.meta, "transport"),
        status: metaString(item.meta, "status"),
        configured: metaBool(item.meta, "configured"),
        logo_url: metaNullableString(item.meta, "logo_url"),
        brand_color: metaNullableString(item.meta, "brand_color"),
      });
    }
  }
  return {
    ...(cliApps.length ? { cliApps } : {}),
    ...(mcpPresets.length ? { mcpPresets } : {}),
  };
}

export function sendOptionsFromAttachments(attachments: MentionAttachment[]): {
  attachments: MentionAttachment[];
  cliApps?: OutboundCliAppMention[];
  mcpPresets?: OutboundMcpPresetMention[];
} | undefined {
  if (attachments.length === 0) return undefined;
  return {
    attachments,
    ...wireLegacyMentionsFromAttachments(attachments),
  };
}
