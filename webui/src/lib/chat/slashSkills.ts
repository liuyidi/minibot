/** Slash-palette helpers for Cursor-style `/skill-name` skills. */

import type { SkillSummary, SlashCommand } from "@/lib/types";

/** Builtin control commands that must not collide with skill names. */
export const RESERVED_SLASH_COMMAND_NAMES = new Set([
  "stop",
  "restart",
  "new",
  "history",
  "model",
  "goal",
  "help",
  "clear",
  "compact",
  "status",
  "skills",
]);

export function slashCommandName(command: string): string {
  return command.replace(/^\//, "").toLowerCase();
}

export function skillsToSlashCommands(
  skills: SkillSummary[],
  reserved: Set<string> = RESERVED_SLASH_COMMAND_NAMES,
): SlashCommand[] {
  return skills
    .filter((skill) => skill.available !== false)
    .filter((skill) => !reserved.has(skill.name.toLowerCase()))
    .map((skill) => ({
      command: `/${skill.name}`,
      title: skill.name,
      description: skill.description || skill.name,
      icon: "hammer",
      argHint: "",
    }));
}

export function mergeSlashPaletteCommands(
  builtinCommands: SlashCommand[],
  skills: SkillSummary[],
): SlashCommand[] {
  const reserved = new Set(RESERVED_SLASH_COMMAND_NAMES);
  for (const command of builtinCommands) {
    reserved.add(slashCommandName(command.command));
  }
  const skillCommands = skillsToSlashCommands(skills, reserved);
  return [...builtinCommands, ...skillCommands];
}
