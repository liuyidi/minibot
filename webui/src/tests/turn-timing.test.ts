import { describe, expect, it } from "vitest";

import {
  computeLiveTurnDurationMs,
  formatTurnDurationCompact,
  resolveTurnLatencyMs,
  turnHasExpandableActivity,
} from "@/lib/chat/turn-timing";
import type { TurnUnit } from "@/lib/chat/activity-timeline";

describe("turn-timing", () => {
  it("formats compact durations", () => {
    expect(formatTurnDurationCompact(800)).toBe("1s");
    expect(formatTurnDurationCompact(65_000)).toBe("1m 5s");
  });

  it("resolves completed latency from assistant message", () => {
    const units: TurnUnit[] = [
      {
        type: "message",
        message: {
          id: "a1",
          role: "assistant",
          content: "done",
          latencyMs: 12_400,
          createdAt: 1,
        },
      },
    ];
    expect(resolveTurnLatencyMs(units)).toBe(12_400);
  });

  it("detects expandable activity blocks", () => {
    const units: TurnUnit[] = [
      {
        type: "activity",
        messages: [{
          id: "r1",
          role: "assistant",
          content: "",
          reasoning: "thinking",
          createdAt: 1,
        }],
        items: [],
      },
    ];
    expect(turnHasExpandableActivity(units)).toBe(true);
  });

  it("computes live duration from startedAt", () => {
    expect(computeLiveTurnDurationMs(1_000, 14_500)).toBe(13_500);
  });
});
