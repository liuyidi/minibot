import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Hammer } from "lucide-react";

import { logoFallbackUrls } from "@/lib/constants/provider-brand";
import type { CliAppInfo, McpPresetInfo, SkillSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function cliAppInitials(app: CliAppInfo): string {
  const value = app.display_name || app.name;
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || app.name.slice(0, 2).toUpperCase()
  );
}

export function mcpPresetInitials(preset: Pick<McpPresetInfo, "name" | "display_name">): string {
  const value = preset.display_name || preset.name;
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || preset.name.slice(0, 2).toUpperCase()
  );
}

const chipChrome =
  "inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-foreground shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]";

function MentionChipShell({
  children,
  className,
  title,
  testId,
  label,
  variant,
}: {
  children: ReactNode;
  className?: string;
  title: string;
  testId: string;
  label: string;
  variant: "composer" | "message";
}) {
  // Message bubbles are read-only: lay out in normal flow so following text
  // cannot sit under the wider pill. Composer keeps an absolute overlay so the
  // caret can stay aligned with the underlying textarea glyphs + caret pad.
  if (variant === "message") {
    return (
      <span
        data-testid={testId}
        title={title}
        className={cn(chipChrome, "mx-0.5 align-middle", className)}
      >
        {children}
      </span>
    );
  }

  return (
    <span className="relative inline-flex align-baseline" data-testid={testId} title={title}>
      <span className="invisible whitespace-pre" aria-hidden>
        {label}
      </span>
      <span
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2",
          chipChrome,
          className,
        )}
      >
        {children}
      </span>
    </span>
  );
}

export function CliAppMentionToken({
  app,
  label,
  variant,
  isHero = false,
}: {
  app: CliAppInfo;
  label: string;
  variant: "composer" | "message";
  isHero?: boolean;
}) {
  const [logoIndex, setLogoIndex] = useState(0);
  const mentionName = label.startsWith("@") ? label.slice(1) : label;
  const logoUrls = useMemo(() => logoFallbackUrls(app.logo_url), [app.logo_url]);
  const logoUrl = logoUrls[logoIndex];
  const testIdPrefix = variant === "composer" ? "composer" : "message";

  useEffect(() => setLogoIndex(0), [app.logo_url]);

  return (
    <MentionChipShell
      variant={variant}
      testId={`${testIdPrefix}-cli-mention-${app.name}`}
      title={`CLI app: ${app.display_name || app.name}`}
      label={label}
      className={isHero ? "text-[13px] leading-5" : "text-[12px] leading-4"}
    >
      {logoUrl ? (
        <span
          data-testid={`${testIdPrefix}-cli-mention-logo-${app.name}`}
          className="grid h-3.5 w-3.5 shrink-0 place-items-center overflow-hidden rounded-[3px]"
        >
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setLogoIndex((index) => index + 1)}
          />
        </span>
      ) : (
        <span
          className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] text-[7px] font-semibold text-white"
          style={{ backgroundColor: app.brand_color || "hsl(var(--primary))" }}
        >
          {cliAppInitials(app).slice(0, 1)}
        </span>
      )}
      <span className="max-w-[12rem] truncate font-medium">{mentionName}</span>
    </MentionChipShell>
  );
}

export function McpPresetMentionToken({
  preset,
  label,
  variant,
  isHero = false,
}: {
  preset: McpPresetInfo;
  label: string;
  variant: "composer" | "message";
  isHero?: boolean;
}) {
  const [logoIndex, setLogoIndex] = useState(0);
  const mentionName = label.startsWith("@") ? label.slice(1) : label;
  const logoUrls = useMemo(() => logoFallbackUrls(preset.logo_url), [preset.logo_url]);
  const logoUrl = logoUrls[logoIndex];
  const testIdPrefix = variant === "composer" ? "composer" : "message";

  useEffect(() => setLogoIndex(0), [preset.logo_url]);

  return (
    <MentionChipShell
      variant={variant}
      testId={`${testIdPrefix}-mcp-mention-${preset.name}`}
      title={`MCP server: ${preset.display_name || preset.name}`}
      label={label}
      className={isHero ? "text-[13px] leading-5" : "text-[12px] leading-4"}
    >
      {logoUrl ? (
        <span
          data-testid={`${testIdPrefix}-mcp-mention-logo-${preset.name}`}
          className="grid h-3.5 w-3.5 shrink-0 place-items-center overflow-hidden rounded-[3px]"
        >
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setLogoIndex((index) => index + 1)}
          />
        </span>
      ) : (
        <span
          className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] text-[7px] font-semibold text-white"
          style={{ backgroundColor: preset.brand_color || "hsl(var(--primary))" }}
        >
          {mcpPresetInitials(preset).slice(0, 1)}
        </span>
      )}
      <span className="max-w-[12rem] truncate font-medium">{mentionName}</span>
    </MentionChipShell>
  );
}

export function SkillMentionToken({
  skill,
  label,
  variant,
  isHero = false,
}: {
  skill: SkillSummary;
  label: string;
  variant: "composer" | "message";
  isHero?: boolean;
}) {
  const skillName = label.startsWith("/") ? label.slice(1) : label;
  const testIdPrefix = variant === "composer" ? "composer" : "message";
  return (
    <MentionChipShell
      variant={variant}
      testId={`${testIdPrefix}-skill-mention-${skill.name}`}
      title={`Skill: ${skill.name}`}
      label={label}
      className={isHero ? "text-[13px] leading-5" : "text-[12px] leading-4"}
    >
      <Hammer className="h-3.5 w-3.5 shrink-0 text-foreground/80" aria-hidden />
      <span className="max-w-[12rem] truncate font-medium">{skillName}</span>
    </MentionChipShell>
  );
}
