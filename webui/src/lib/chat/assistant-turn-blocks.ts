import type { TurnUnit } from "@/lib/chat/activity-timeline";

export type AssistantTurnBlock = {
  kind: "assistant-turn";
  units: { unit: TurnUnit; index: number }[];
  blockId: string;
};

export type ThreadRenderBlock =
  | { kind: "user"; message: TurnUnit & { type: "message" }; index: number }
  | AssistantTurnBlock;

export function groupUnitsIntoRenderBlocks(units: TurnUnit[]): ThreadRenderBlock[] {
  const blocks: ThreadRenderBlock[] = [];
  let i = 0;
  while (i < units.length) {
    const unit = units[i];
    if (unit.type === "message" && unit.message.role === "user") {
      blocks.push({ kind: "user", message: unit, index: i });
      i += 1;
      continue;
    }

    const turnUnits: { unit: TurnUnit; index: number }[] = [];
    while (i < units.length) {
      const current = units[i];
      if (current.type === "message" && current.message.role === "user") break;
      turnUnits.push({ unit: current, index: i });
      i += 1;
    }
    if (turnUnits.length) {
      blocks.push({
        kind: "assistant-turn",
        units: turnUnits,
        blockId: assistantTurnBlockId(turnUnits),
      });
    }
  }
  return blocks;
}

function assistantTurnBlockId(turnUnits: { unit: TurnUnit; index: number }[]): string {
  for (const { unit } of turnUnits) {
    if (unit.type === "message") {
      const turnId = unit.message.turnId?.trim();
      if (turnId) return `turn:${turnId}`;
      return `msg:${unit.message.id}`;
    }
  }
  const first = turnUnits[0]?.unit;
  if (first?.type === "activity") {
    const anchor = first.messages[0]?.id;
    if (anchor) return `activity:${anchor}`;
  }
  return `turn-idx:${turnUnits[0]?.index ?? 0}`;
}
