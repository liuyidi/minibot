import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { findAtomicMentionDeleteRange } from "@/lib/chat/mentionAtoms";
import type { MentionCandidate } from "@/lib/chat/mentions";
import type { CliAppInfo, McpPresetInfo, SkillSummary, SlashCommand } from "@/lib/types";

export function handleComposerKeyDown(
  e: ReactKeyboardEvent<HTMLTextAreaElement>,
  opts: {
    value: string;
    cliApps: CliAppInfo[];
    mcpPresets: McpPresetInfo[];
    skills: SkillSummary[];
    showCliAppMenu: boolean;
    showSlashMenu: boolean;
    filteredMentionCandidates: MentionCandidate[];
    filteredSlashCommands: SlashCommand[];
    selectedCliAppIndex: number;
    selectedCommandIndex: number;
    canQueueGuidance: boolean;
    setSelectedCliAppIndex: (updater: (idx: number) => number) => void;
    setSelectedCommandIndex: (updater: (idx: number) => number) => void;
    setCliAppMenuDismissed: (value: boolean) => void;
    setSlashMenuDismissed: (value: boolean) => void;
    chooseMentionCandidate: (candidate: MentionCandidate) => void;
    chooseSlashCommand: (command: SlashCommand) => void;
    onAtomicDelete: (next: string, cursor: number) => void;
    queueGuidancePrompt: () => void;
    submit: () => void;
  },
): void {
  const {
    value,
    cliApps,
    mcpPresets,
    skills,
    showCliAppMenu,
    showSlashMenu,
    filteredMentionCandidates,
    filteredSlashCommands,
    selectedCliAppIndex,
    selectedCommandIndex,
    canQueueGuidance,
    setSelectedCliAppIndex,
    setSelectedCommandIndex,
    setCliAppMenuDismissed,
    setSlashMenuDismissed,
    chooseMentionCandidate,
    chooseSlashCommand,
    onAtomicDelete,
    queueGuidancePrompt,
    submit,
  } = opts;

  if (showCliAppMenu) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedCliAppIndex((idx) => (idx + 1) % filteredMentionCandidates.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedCliAppIndex(
        (idx) => (idx - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length,
      );
      return;
    }
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      chooseMentionCandidate(filteredMentionCandidates[selectedCliAppIndex]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setCliAppMenuDismissed(true);
      return;
    }
  }
  if (showSlashMenu) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedCommandIndex((idx) => (idx + 1) % filteredSlashCommands.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedCommandIndex(
        (idx) => (idx - 1 + filteredSlashCommands.length) % filteredSlashCommands.length,
      );
      return;
    }
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      chooseSlashCommand(filteredSlashCommands[selectedCommandIndex]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSlashMenuDismissed(true);
      return;
    }
  }
  if (
    e.key === "Backspace"
    && !e.metaKey
    && !e.ctrlKey
    && !e.altKey
    && !e.nativeEvent.isComposing
  ) {
    const el = e.currentTarget;
    const selStart = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? 0;
    if (selStart === selEnd) {
      const range = findAtomicMentionDeleteRange(
        value,
        selStart,
        cliApps,
        mcpPresets,
        skills,
      );
      if (range) {
        e.preventDefault();
        onAtomicDelete(
          `${value.slice(0, range.start)}${value.slice(range.end)}`,
          range.start,
        );
        return;
      }
    }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    if (canQueueGuidance) {
      queueGuidancePrompt();
      return;
    }
    submit();
  }
}
