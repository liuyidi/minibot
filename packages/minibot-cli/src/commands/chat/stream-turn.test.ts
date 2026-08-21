import { describe, expect, it, vi } from "vitest";
import type { InboundEvent, MinibotWsClient } from "@minibot/client";
import { streamTurn } from "./stream-turn.js";

function fakeWs(events: InboundEvent[]): { ws: MinibotWsClient; send: ReturnType<typeof vi.fn> } {
  const handlers = new Set<(ev: InboundEvent) => void>();
  const send = vi.fn();
  const ws = {
    onChat(_chatId: string, handler: (ev: InboundEvent) => void) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    sendMessage() {
      queueMicrotask(() => {
        for (const ev of events) {
          for (const h of handlers) h(ev);
        }
      });
    },
    send,
    abort: vi.fn()
  } as unknown as MinibotWsClient;
  return { ws, send };
}

describe("streamTurn", () => {
  it("prints deltas and resolves on stream_end", async () => {
    const chunks: string[] = [];
    const { ws } = fakeWs([
      { event: "delta", chat_id: "c1", text: "Hello" },
      { event: "delta", chat_id: "c1", text: " world" },
      { event: "stream_end", chat_id: "c1" }
    ]);
    await streamTurn({
      ws,
      chatId: "c1",
      content: "hi",
      write: (t) => chunks.push(t)
    });
    expect(chunks.join("")).toBe("Hello world\n");
  });

  it("auto-rejects approval_required", async () => {
    const approvalEv = {
      event: "approval_required",
      chat_id: "c1",
      approval: { id: "ap-1", reason: "bash" }
    } as unknown as InboundEvent;
    const { ws, send } = fakeWs([approvalEv, { event: "stream_end", chat_id: "c1" }]);
    await streamTurn({
      ws,
      chatId: "c1",
      content: "run",
      write: () => undefined,
      writeErr: () => undefined
    });
    expect(send).toHaveBeenCalledWith({
      type: "approval_response",
      approval_id: "ap-1",
      decision: "reject"
    });
  });
});
