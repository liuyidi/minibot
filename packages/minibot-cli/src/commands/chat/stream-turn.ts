import type { InboundEvent, MinibotWsClient } from "@minibot/client";
import chalk from "chalk";

export type StreamTurnOptions = {
  ws: MinibotWsClient;
  chatId: string;
  content: string;
  /** Auto-reject HITL approvals (Phase A default). */
  rejectApprovals?: boolean;
  write?: (text: string) => void;
  writeErr?: (text: string) => void;
};

function isApprovalRequired(ev: InboundEvent | { event: string; [key: string]: unknown }): boolean {
  return ev.event === "approval_required";
}

/**
 * Send one user message and wait until stream_end / turn_end / error.
 */
export function streamTurn(options: StreamTurnOptions): Promise<void> {
  const write = options.write ?? ((t) => process.stdout.write(t));
  const writeErr = options.writeErr ?? ((t) => process.stderr.write(t));
  const rejectApprovals = options.rejectApprovals !== false;

  return new Promise((resolve, reject) => {
    let settled = false;
    // onChat may flush pending events synchronously before the assignment below.
    let unsub: () => void = () => undefined;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      unsub();
      if (err) reject(err);
      else resolve();
    };

    unsub = options.ws.onChat(options.chatId, (ev) => {
      if (ev.event === "delta" && typeof ev.text === "string") {
        write(ev.text);
        return;
      }
      if (ev.event === "message" && typeof ev.text === "string" && ev.kind !== "user") {
        // Final message frame; deltas usually already printed.
        if (ev.text && !ev.text.endsWith("\n")) write("\n");
        return;
      }
      if (ev.event === "stream_end" || ev.event === "turn_end") {
        write("\n");
        finish();
        return;
      }
      if (ev.event === "error") {
        finish(new Error(ev.detail || "stream error"));
        return;
      }
      if (isApprovalRequired(ev)) {
        const approval = (ev as { approval?: { id?: string; reason?: string } }).approval;
        const approvalId = approval?.id || (ev as { approval_id?: string }).approval_id;
        writeErr(
          chalk.yellow(
            `\n[approval required] ${approval?.reason || "tool needs approval"}` +
              (rejectApprovals ? " — auto-rejecting\n" : "\n")
          )
        );
        if (rejectApprovals && approvalId) {
          options.ws.send({
            type: "approval_response",
            approval_id: approvalId,
            decision: "reject"
          });
        }
      }
    });

    options.ws.sendMessage(options.chatId, options.content);
  });
}

export function waitForWsOpen(ws: MinibotWsClient, timeoutMs = 10_000): Promise<void> {
  if (ws.status === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    // onStatus invokes the handler immediately with the current status.
    let unsub: () => void = () => undefined;
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("WebSocket connect timed out"));
    }, timeoutMs);
    unsub = ws.onStatus((status) => {
      if (status === "open") {
        clearTimeout(timer);
        unsub();
        resolve();
      }
      if (status === "error" || status === "closed") {
        clearTimeout(timer);
        unsub();
        reject(new Error(`WebSocket ${status}`));
      }
    });
    ws.connect();
  });
}
