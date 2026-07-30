/** Shared protocol types for minibot Client API (RN / webui / desktop). */

export interface BootstrapResponse {
  token: string;
  ws_path: string;
  expires_in: number;
  model_name?: string;
  runtime_surface?: string;
  ws_url?: string | null;
}

export interface SessionSummary {
  id: string;
  /** Full key, usually `websocket:<id>`. */
  key: string;
  title: string;
  preview: string;
  workspace_path?: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface TurnResult {
  content: string;
  tools_used: string[];
  stop_reason: string;
  messages: unknown[];
  trace?: unknown[];
  langfuse_trace_id?: string;
}

/** Minimal thread message shape (subset of webui UIMessage). */
export interface ThreadMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system" | string;
  content: string;
  kind?: string;
  reasoning?: string;
  createdAt?: number;
  [key: string]: unknown;
}

export interface WebuiThreadPayload {
  schemaVersion?: number;
  sessionKey?: string;
  messages: ThreadMessage[];
  workspace_scope?: WorkspaceScope | null;
  [key: string]: unknown;
}

export interface WorkspaceScope {
  path?: string;
  [key: string]: unknown;
}

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export type InboundEvent =
  | { event: "ready"; chat_id: string; client_id?: string }
  | { event: "attached"; chat_id: string }
  | {
      event: "message";
      chat_id: string;
      text: string;
      kind?: string;
      latency_ms?: number;
      [key: string]: unknown;
    }
  | {
      event: "delta";
      chat_id: string;
      text: string;
      stream_id?: string;
      [key: string]: unknown;
    }
  | {
      event: "stream_end";
      chat_id: string;
      stream_id?: string;
      text?: string;
      [key: string]: unknown;
    }
  | {
      event: "reasoning_delta";
      chat_id: string;
      text: string;
      stream_id?: string;
      [key: string]: unknown;
    }
  | {
      event: "reasoning_end";
      chat_id: string;
      stream_id?: string;
      [key: string]: unknown;
    }
  | {
      event: "provider_switched";
      chat_id?: string;
      from?: string;
      to?: string;
      reason?: string;
      [key: string]: unknown;
    }
  | {
      event: "turn_end";
      chat_id: string;
      latency_ms?: number;
      [key: string]: unknown;
    }
  | { event: "error"; chat_id?: string; detail?: string; reason?: string };

/** Loose frame for forward-compat unknown events. */
export type InboundEventUnknown = {
  event: string;
  chat_id?: string;
  [key: string]: unknown;
};

export type OutboundFrame =
  | { type: "new_chat"; workspace_scope?: WorkspaceScope }
  | { type: "attach"; chat_id: string }
  | {
      type: "message";
      chat_id: string;
      content: string;
      media?: Array<{ data_url: string; name?: string }>;
      turn_id?: string;
      /** Compatibility flag used by embedded webui; harmless for other clients. */
      webui?: boolean;
    }
  | { type: "abort" | "stop"; chat_id: string }
  | { type: string; [key: string]: unknown };

export type StreamError =
  | { kind: "message_too_big" }
  | { kind: "workspace_scope_rejected"; reason?: string; chatId?: string };
