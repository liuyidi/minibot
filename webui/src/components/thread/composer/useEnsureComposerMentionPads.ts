import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import { ensureMentionChipPadsWithCaret } from "@/lib/chat/mentionAtoms";
import type { CliAppInfo, McpPresetInfo, SkillSummary } from "@/lib/types";

/** Keep `@` / `/` chips padded in the controlled composer value (paste-safe). */
export function useEnsureComposerMentionPads(
  value: string,
  setValue: Dispatch<SetStateAction<string>>,
  setCursorPosition: (pos: number) => void,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  cliApps: CliAppInfo[],
  mcpPresets: McpPresetInfo[],
  skills: SkillSummary[],
): void {
  useEffect(() => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const next = ensureMentionChipPadsWithCaret(value, caret, cliApps, mcpPresets, skills);
    if (next.value === value) return;
    setValue(next.value);
    setCursorPosition(next.caret);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(next.caret, next.caret);
    });
  }, [cliApps, mcpPresets, setCursorPosition, setValue, skills, textareaRef, value]);
}

export function commitComposerMentionPadChange(
  raw: string,
  caret: number,
  cliApps: CliAppInfo[],
  mcpPresets: McpPresetInfo[],
  skills: SkillSummary[],
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  setValue: Dispatch<SetStateAction<string>>,
  setCursorPosition: (pos: number) => void,
): void {
  const next = ensureMentionChipPadsWithCaret(raw, caret, cliApps, mcpPresets, skills);
  setValue(next.value);
  setCursorPosition(next.caret);
  if (next.value === raw) return;
  requestAnimationFrame(() => {
    textareaRef.current?.setSelectionRange(next.caret, next.caret);
  });
}
