import type { MentionAttachment } from "@/lib/chat/mentions";
import type {
  OutboundCliAppMention,
  OutboundImageGeneration,
  OutboundMcpPresetMention,
  OutboundMedia,
  UIImage,
  WorkspaceScopePayload,
} from "@/lib/types";

/** Payload passed to ``send`` when the user attaches one or more images.
 *
 * ``media`` is handed to the wire client verbatim; ``preview`` powers the
 * optimistic user bubble (blob URLs so the preview appears before the server
 * acks the frame). Keeping the two separate lets the bubble re-use the local
 * blob URL even after the server persists the file under a different name. */
export interface SendImage {
  media: OutboundMedia;
  preview: UIImage;
}

export interface SendOptions {
  imageGeneration?: OutboundImageGeneration;
  /** Unified mention attachments. Prefer this; wire still expands to cli/mcp. */
  attachments?: MentionAttachment[];
  /** @deprecated Prefer attachments; kept for wire + optimistic bubble compat. */
  cliApps?: OutboundCliAppMention[];
  /** @deprecated Prefer attachments; kept for wire + optimistic bubble compat. */
  mcpPresets?: OutboundMcpPresetMention[];
  workspaceScope?: WorkspaceScopePayload | null;
}
