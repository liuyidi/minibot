import type { TFunction } from "i18next";

import { slashCommandName } from "@/lib/chat/slashSkills";
import type { SkillSummary, SlashCommand } from "@/lib/types";

export function skillBuiltinI18nKey(name: string, field: "title" | "description"): string {
  return `settings.skills.builtin.${name}.${field}`;
}

export function resolveSkillTitle(skill: Pick<SkillSummary, "name" | "description">, t: TFunction): string {
  return t(skillBuiltinI18nKey(skill.name, "title"), { defaultValue: skill.name });
}

export function resolveSkillDescription(
  skill: Pick<SkillSummary, "name" | "description">,
  t: TFunction,
): string {
  return t(skillBuiltinI18nKey(skill.name, "description"), {
    defaultValue: skill.description || skill.name,
  });
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
