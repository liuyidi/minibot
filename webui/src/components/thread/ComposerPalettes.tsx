import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  BookOpen,
  Brain,
  CircleHelp,
  Hammer,
  History,
  Minimize2,
  RotateCw,
  Shield,
  Sparkles,
  Square,
  SquarePen,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  CliAppMentionToken,
  McpPresetMentionToken,
  SkillMentionToken,
  cliAppInitials,
  mcpPresetInitials,
  type CapabilityMentionSegment,
} from "./CliAppMentionText";
import type { MentionCandidate } from "@/lib/chat/mentions";
import type { SlashCommand } from "@/lib/types";
import { logoFallbackUrls } from "@/lib/constants/provider-brand";
import { cn } from "@/lib/utils";

export const SLASH_PALETTE_CHROME_PX = 12;

export type SlashPalettePlacement = "above" | "below";

export interface SlashPaletteLayout {
  placement: SlashPalettePlacement;
  maxHeight: number;
}

export interface SlashPaletteCommand extends SlashCommand {
  detail: string;
  badge?: string;
  recent: boolean;
}

const COMMAND_ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  "book-open": BookOpen,
  brain: Brain,
  "circle-help": CircleHelp,
  hammer: Hammer,
  history: History,
  "minimize-2": Minimize2,
  "rotate-cw": RotateCw,
  shield: Shield,
  sparkles: Sparkles,
  square: Square,
  "square-pen": SquarePen,
  "undo-2": Undo2,
};

function slashCommandI18nKey(command: string): string {
  return command.replace(/^\//, "").replace(/-/g, "_");
}

function useSelectedOptionScroll(selectedIndex: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const option = container.querySelector<HTMLElement>(
      `[data-palette-index="${selectedIndex}"]`,
    );
    if (typeof option?.scrollIntoView === "function") {
      option.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  return containerRef;
}

export function ComposerCliMentionOverlay({
  segments,
  isHero,
  className,
}: {
  segments: CapabilityMentionSegment[];
  isHero: boolean;
  className: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        className,
        "pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words text-foreground",
      )}
    >
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
              variant="composer"
              isHero={isHero}
            />
          );
        }
        if (segment.kind === "mcp") {
          return (
            <McpPresetMentionToken
              key={`mcp-${segment.preset.name}-${index}`}
              preset={segment.preset}
              label={segment.text}
              variant="composer"
              isHero={isHero}
            />
          );
        }
        return (
          <SkillMentionToken
            key={`skill-${segment.skill.name}-${index}`}
            skill={segment.skill}
            label={segment.text}
            variant="composer"
            isHero={isHero}
          />
        );
      })}
    </div>
  );
}

export function CliAppMentionPalette({
  candidates,
  selectedIndex,
  layout,
  isHero,
  onHover,
  onChoose,
}: {
  candidates: MentionCandidate[];
  selectedIndex: number;
  layout: SlashPaletteLayout;
  isHero: boolean;
  onHover: (index: number) => void;
  onChoose: (candidate: MentionCandidate) => void;
}) {
  const { t } = useTranslation();
  const listMaxHeight = Math.max(0, layout.maxHeight - SLASH_PALETTE_CHROME_PX);
  const listRef = useSelectedOptionScroll(selectedIndex);
  return (
    <div
      role="listbox"
      aria-label={t("thread.composer.mentions.ariaLabel")}
      style={{ maxHeight: layout.maxHeight }}
      className={cn(
        "absolute left-1/2 z-30 w-[calc(100%-0.5rem)] -translate-x-1/2 overflow-hidden rounded-[22px] border",
        layout.placement === "above" ? "bottom-full mb-2" : "top-full mt-2",
        "border-border/70 bg-popover p-2 text-popover-foreground shadow-[0_20px_60px_rgba(15,23,42,0.12)]",
        "dark:border-white/10 dark:shadow-[0_24px_60px_rgba(0,0,0,0.42)]",
        isHero ? "max-w-[58rem]" : "max-w-[49.5rem]",
      )}
    >
      <div className="px-2 pb-1.5 pt-0.5 text-[13px] font-semibold text-muted-foreground/78">
        {t("thread.composer.mentions.label")}
      </div>
      <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: listMaxHeight }}>
        {candidates.map((candidate, index) => {
          const selected = index === selectedIndex;
          const name = candidate.name;
          const displayName = candidate.label;
          const typeLabel = candidate.kind === "cli"
            ? t("thread.composer.mentions.cliBadge")
            : t("thread.composer.mentions.mcpBadge");
          const ariaDescription = candidate.kind === "cli"
            ? t("thread.composer.mentions.cliDescription", { name })
            : t("thread.composer.mentions.mcpDescription", { name });
          return (
            <button
              key={`${candidate.kind}-${name}`}
              type="button"
              role="option"
              data-palette-index={index}
              aria-selected={selected}
              aria-label={`${displayName} @${name} ${ariaDescription} ${typeLabel}`}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                onChoose(candidate);
              }}
              className={cn(
                "flex min-h-10 w-full items-center gap-2.5 rounded-[13px] px-2.5 py-1.5 text-left transition-colors",
                selected
                  ? "bg-foreground/[0.055] text-foreground"
                  : "text-foreground/90 hover:bg-foreground/[0.04]",
              )}
            >
              <MentionCandidateLogo candidate={candidate} selected={selected} />
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="min-w-0 truncate text-[15px] font-medium tracking-normal text-foreground">
                  {displayName}
                </span>
                <span className="truncate text-[15px] font-normal tracking-normal text-muted-foreground/72">
                  @{name}
                </span>
              </span>
              <span
                className={cn(
                  "ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-normal",
                  candidate.kind === "cli"
                    ? "bg-orange-500/10 text-orange-600 dark:text-orange-300"
                    : "bg-sky-500/10 text-sky-600 dark:text-sky-300",
                )}
              >
                {typeLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MentionCandidateLogo({
  candidate,
  selected,
}: {
  candidate: MentionCandidate;
  selected: boolean;
}) {
  const [logoIndex, setLogoIndex] = useState(0);
  const color = (candidate.kind === "cli"
    ? candidate.app.brand_color
    : candidate.preset.brand_color) || "hsl(var(--primary))";
  const rawLogoUrl = candidate.kind === "cli" ? candidate.app.logo_url : candidate.preset.logo_url;
  const logoUrls = useMemo(() => logoFallbackUrls(rawLogoUrl), [rawLogoUrl]);
  const logoUrl = logoUrls[logoIndex];

  useEffect(() => setLogoIndex(0), [rawLogoUrl]);

  if (logoUrl) {
    return (
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-[5px]",
          selected ? "bg-background/55" : "bg-transparent",
        )}
      >
        <img
          src={logoUrl}
          alt=""
          className="h-5 w-5 object-contain"
          onError={() => setLogoIndex((index) => index + 1)}
        />
      </span>
    );
  }
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-[7.5px] font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {candidate.kind === "cli"
        ? cliAppInitials(candidate.app)
        : mcpPresetInitials(candidate.preset)}
    </span>
  );
}

export function SlashCommandPalette({
  commands,
  selectedIndex,
  layout,
  isHero,
  onHover,
  onChoose,
}: {
  commands: SlashPaletteCommand[];
  selectedIndex: number;
  layout: SlashPaletteLayout;
  isHero: boolean;
  onHover: (index: number) => void;
  onChoose: (command: SlashPaletteCommand) => void;
}) {
  const { t } = useTranslation();
  const listMaxHeight = Math.max(0, layout.maxHeight - SLASH_PALETTE_CHROME_PX);
  const listRef = useSelectedOptionScroll(selectedIndex);
  return (
    <div
      role="listbox"
      aria-label={t("thread.composer.slash.ariaLabel")}
      style={{ maxHeight: layout.maxHeight }}
      className={cn(
        "absolute left-1/2 z-30 w-[calc(100%-0.5rem)] -translate-x-1/2 overflow-hidden rounded-[18px] border",
        layout.placement === "above" ? "bottom-full mb-2" : "top-full mt-2",
        "border-border/65 bg-popover p-1.5 text-popover-foreground shadow-[0_18px_55px_rgba(15,23,42,0.16)]",
        "dark:border-white/10 dark:shadow-[0_22px_55px_rgba(0,0,0,0.45)]",
        isHero ? "max-w-[58rem]" : "max-w-[49.5rem]",
      )}
    >
      <div ref={listRef} className="overflow-y-auto pr-0.5" style={{ maxHeight: listMaxHeight }}>
        {commands.map((command, index) => {
          const Icon = COMMAND_ICONS[command.icon] ?? CircleHelp;
          const selected = index === selectedIndex;
          const commandKey = slashCommandI18nKey(command.command);
          const title = t(`thread.composer.slash.commands.${commandKey}.title`, {
            defaultValue: command.title,
          });
          const description = t(`thread.composer.slash.commands.${commandKey}.description`, {
            defaultValue: command.description,
          });
          return (
            <button
              key={command.command}
              type="button"
              role="option"
              data-palette-index={index}
              aria-selected={selected}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                onChoose(command);
              }}
              className={cn(
                "flex min-h-[44px] w-full items-center gap-3 rounded-[13px] px-3 py-2 text-left transition-colors",
                selected
                  ? "bg-foreground/[0.065] text-foreground dark:bg-white/[0.09]"
                  : "text-foreground/86 hover:bg-foreground/[0.045] dark:hover:bg-white/[0.065]",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors",
                  selected && "text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <span className="shrink-0 text-[13.5px] font-semibold tracking-normal text-foreground">
                  {title}
                </span>
                <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                  {command.detail || description}
                </span>
              </span>
              <span className="ml-2 flex max-w-[42%] shrink-0 items-center gap-1.5 sm:max-w-none">
                {command.badge || command.recent ? (
                  <span className="hidden rounded-full bg-foreground/[0.055] px-2 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                    {command.badge ?? t("thread.composer.slash.badges.recent")}
                  </span>
                ) : null}
                <span className="font-mono text-[12px] text-muted-foreground/60">
                  {command.argHint ? `${command.command} ${command.argHint}` : command.command}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
