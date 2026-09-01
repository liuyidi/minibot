import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssistantTurnMeta } from "@/components/thread/messages/AssistantTurnMeta";
import type { TurnUnit } from "@/lib/chat/activity-timeline";

describe("AssistantTurnMeta", () => {
  it("shows completed duration at the top of an assistant turn", () => {
    const units: TurnUnit[] = [
      {
        type: "message",
        message: {
          id: "a1",
          role: "assistant",
          content: "answer",
          latencyMs: 13_000,
          createdAt: 1,
        },
      },
    ];

    render(<AssistantTurnMeta units={units} isStreaming={false} />);

    expect(screen.getByText(/Completed ·/)).toBeInTheDocument();
  });

  it("shows thinking duration while streaming", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T12:00:13Z"));
    const units: TurnUnit[] = [
      {
        type: "activity",
        messages: [{
          id: "r1",
          role: "assistant",
          content: "",
          reasoning: "thinking",
          isStreaming: true,
          reasoningStreaming: true,
          createdAt: Date.parse("2026-04-18T12:00:00Z"),
        }],
        items: [],
      },
    ];

    render(
      <AssistantTurnMeta
        units={units}
        isStreaming
        runStartedAt={Date.parse("2026-04-18T12:00:00Z") / 1000}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Deep thinking")).toBeInTheDocument();
    expect(screen.getByText(/Thinking ·/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
