/** WebSocket inbound/outbound envelopes and connection status. */

import type {
  AgentUIBlob,
  GoalStateWsPayload,
  ToolProgressEvent,
  UIFileEdit,
  UIMessageSource,
  UITurnPhase,
} from "./message";
import type { WorkspaceScopePayload } from "./session";

export interface SlashCommand {
  command: string;
  title: string;
  description: string;
  icon: string;
  argHint?: string;
}

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export interface InboundTurnMetadata {
  turn_id?: string;
  turn_phase?: UITurnPhase;
  turn_seq?: number;
}

export interface ApprovalToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** A durable human decision requested before minibot runs risky tools. */
export interface PendingApproval {
  id: string;
  session_id: string;
  tool_calls: ApprovalToolCall[];
  reason: string;
  risk: string;
  created_at_ms: number;
  expires_at_ms: number;
  status: "pending" | "approved" | "rejected" | "expired" | string;
}

export type InboundEvent =
  | { event: "ready"; chat_id: string; client_id: string }
  | { event: "attached"; chat_id: string }
  | ({
      event: "message";
      chat_id: string;
      text: string;
      reply_to?: string;
      media?: string[];
      media_urls?: Array<{ url: string; name?: string }>;
      tool_events?: ToolProgressEvent[];
      /** Present when the frame is an agent breadcrumb (e.g. tool hint,
       * generic progress line) rather than a conversational reply. */
      kind?: "tool_hint" | "progress" | "reasoning";
      /** Server-measured turn wall time when this frame finishes an assistant reply. */
      latency_ms?: number;
      /** Lightweight provenance for proactive assistant messages. */
      source?: UIMessageSource;
      /** Optional structured payload on progress frames (channel-specific). */
      agent_ui?: AgentUIBlob;
    } & InboundTurnMetadata)
  | ({
      event: "file_edit";
      chat_id: string;
      edits: UIFileEdit[];
    } & InboundTurnMetadata)
  | ({
      event: "delta";
      chat_id: string;
      text: string;
      stream_id?: string;
    } & InboundTurnMetadata)
  | ({
      event: "stream_end";
      chat_id: string;
      stream_id?: string;
      text?: string;
    } & InboundTurnMetadata)
  | ({
      event: "reasoning_delta";
      chat_id: string;
      text: string;
      stream_id?: string;
    } & InboundTurnMetadata)
  | ({
      event: "reasoning_end";
      chat_id: string;
      stream_id?: string;
    } & InboundTurnMetadata)
  | {
      event: "runtime_model_updated";
      model_name: string;
      model_preset?: string | null;
    }
  | ({
      event: "turn_end";
      chat_id: string;
      latency_ms?: number;
      /** Authoritative sustained-goal snapshot for this chat (same shape as ``goal_state`` events). */
      goal_state?: GoalStateWsPayload;
    } & InboundTurnMetadata)
  | {
      event: "goal_status";
      chat_id: string;
      /** Turn executing (user message through agent loop). */
      status: "running" | "idle" | "waiting_approval";
      /** Server ``time.time()`` when ``status`` is ``running``. */
      started_at?: number;
    }
  | {
      event: "goal_state";
      chat_id: string;
      goal_state: GoalStateWsPayload;
    }
  | { event: "approval_required"; chat_id: string; approval: PendingApproval }
  | {
      event: "agent_trace";
      chat_id: string;
      langfuse_trace_id?: string;
      stop_reason?: string;
      tools_used?: string[];
    }
  | {
      event: "session_updated";
      chat_id: string;
      scope?: "metadata" | "thread" | string;
      workspace_scope?: WorkspaceScopePayload;
    }
  | { event: "transcription_result"; request_id: string; text: string }
  | {
      event: "transcription_error";
      request_id?: string;
      detail?: string;
      provider?: string;
    }
  | { event: "error"; chat_id?: string; detail?: string; reason?: string };

/** Base64-encoded image attached to an outbound ``message`` envelope.
 *
 * ``data_url`` must be a ``data:image/<png|jpeg|webp|gif>;base64,...`` string
 * — the server whitelists those MIME types and rejects everything else
 * (including SVG, to avoid an XSS surface). ``name`` is advisory: it's
 * preserved for the file on disk and surfaced as the placeholder label when
 * the session is replayed.
 */
export interface OutboundMedia {
  data_url: string;
  name?: string;
}

export interface OutboundImageGeneration {
  enabled: true;
  aspect_ratio?: string | null;
}

export interface OutboundCliAppMention {
  name: string;
  display_name?: string;
  category?: string;
  entry_point?: string;
  logo_url?: string | null;
  brand_color?: string | null;
}

export interface OutboundMcpPresetMention {
  name: string;
  display_name?: string;
  category?: string;
  transport?: string;
  status?: string;
  configured?: boolean;
  logo_url?: string | null;
  brand_color?: string | null;
}

export type Outbound =
  | { type: "new_chat"; workspace_scope?: WorkspaceScopePayload }
  | { type: "fork_chat"; source_chat_id: string; before_user_index: number; title?: string }
  | { type: "attach"; chat_id: string }
  | { type: "approval_response"; approval_id: string; decision: "approve" | "reject" }
  | { type: "set_workspace_scope"; chat_id: string; workspace_scope: WorkspaceScopePayload }
  | { type: "transcribe_audio"; request_id: string; data_url: string; duration_ms?: number }
  | {
      type: "message";
      chat_id: string;
      content: string;
      media?: OutboundMedia[];
      image_generation?: OutboundImageGeneration;
      cli_apps?: OutboundCliAppMention[];
      mcp_presets?: OutboundMcpPresetMention[];
      workspace_scope?: WorkspaceScopePayload;
      turn_id?: string;
      /** Marks messages sent by the embedded WebUI, without changing the
       * generic websocket protocol for other clients. */
      webui?: true;
    };
