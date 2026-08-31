import type { TFunction } from "i18next";

import { slashCommandName } from "@/lib/chat/slashSkills";
import {
  resolveCatalogDescription,
  resolveCatalogLabel,
} from "@/lib/skills/market";
import type { SkillSummary, SlashCommand } from "@/lib/types";

export type SkillCatalogLookup = {
  id: string;
  label: string;
  label_zh?: string;
  description?: string;
  description_zh?: string;
};

export type ResolveSkillDisplayOptions = {
  preferZh?: boolean;
  catalog?: SkillCatalogLookup | null;
};

export function skillBuiltinI18nKey(name: string, field: "title" | "description"): string {
  return `settings.skills.builtin.${name}.${field}`;
}

function hasBuiltinTranslation(
  skillName: string,
  field: "title" | "description",
  t: TFunction,
): boolean {
  const key = skillBuiltinI18nKey(skillName, field);
  const marker = `__missing__:${key}`;
  return t(key, { defaultValue: marker }) !== marker;
}

export function resolveSkillTitle(
  skill: Pick<SkillSummary, "name" | "description" | "source">,
  t: TFunction,
  opts?: ResolveSkillDisplayOptions,
): string {
  if (skill.source === "builtin" || hasBuiltinTranslation(skill.name, "title", t)) {
    return t(skillBuiltinI18nKey(skill.name, "title"), { defaultValue: skill.name });
  }
  if (opts?.catalog) {
    return resolveCatalogLabel(opts.catalog, Boolean(opts.preferZh));
  }
  return skill.name;
}

export function resolveSkillDescription(
  skill: Pick<SkillSummary, "name" | "description" | "source">,
  t: TFunction,
  opts?: ResolveSkillDisplayOptions,
): string {
  if (skill.source === "builtin" || hasBuiltinTranslation(skill.name, "description", t)) {
    return t(skillBuiltinI18nKey(skill.name, "description"), {
      defaultValue: skill.description || skill.name,
    });
  }
  if (opts?.catalog) {
    return resolveCatalogDescription(opts.catalog, Boolean(opts.preferZh));
  }
  return skill.description || skill.name;
}

/** Localize backend unavailable markers like `CLI: tmux, ENV: FOO`. */
export function formatUnavailableReason(reason: string, t: TFunction): string {
  const parts = reason
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const cli = /^CLI:\s*(.+)$/i.exec(part);
      if (cli) {
        return t("settings.skills.missingBin", {
          name: cli[1],
          defaultValue: "CLI: {{name}}",
        });
      }
      const env = /^ENV:\s*(.+)$/i.exec(part);
      if (env) {
        return t("settings.skills.missingEnvVar", {
          name: env[1],
          defaultValue: "ENV: {{name}}",
        });
      }
      return part;
    });
  return parts.join(t("settings.skills.unavailableJoin", { defaultValue: ", " }));
}

export function isSkillSlashCommand(command: SlashCommand): boolean {
  return command.icon === "hammer";
}

function slashBuiltinI18nKey(command: string): string {
  return slashCommandName(command).replace(/-/g, "_");
}

export function resolveSlashCommandLabel(
  command: SlashCommand,
  t: TFunction,
  field: "title" | "description",
): string {
  const fallback = field === "title" ? command.title : command.description;
  if (isSkillSlashCommand(command)) {
    const name = slashCommandName(command.command);
    return t(skillBuiltinI18nKey(name, field), { defaultValue: fallback });
  }
  const commandKey = slashBuiltinI18nKey(command.command);
  return t(`thread.composer.slash.commands.${commandKey}.${field}`, { defaultValue: fallback });
}
