import type {
  ConnectionStatus,
  InboundEvent,
  OutboundFrame,
  StreamError,
  WorkspaceScope,
} from "./types.js";

const WS_OPEN = 1;
const WS_CLOSING = 2;

export type Unsubscribe = () => void;
export type EventHandler = (ev: InboundEvent) => void;
export type StatusHandler = (status: ConnectionStatus) => void;
export type ErrorHandler = (error: StreamError) => void;

export type WebSocketConstructor = new (url: string, protocols?: string | string[]) => WebSocket;

export interface MinibotWsOptions {
  /** Absolute ws(s):// URL including ?token= */
  url: string;
  reconnect?: boolean;
  maxBackoffMs?: number;
  /** Inject for tests or Desktop host bridge. */
  socketFactory?: (url: string) => WebSocket;
  WebSocketImpl?: WebSocketConstructor;
  /** Refresh token URL after drop; return new ws url or null. */
  onReauth?: () => Promise<string | null>;
  debug?: boolean;
}

interface PendingNewChat {
  resolve: (chatId: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Multiplexed WebSocket client (one socket, many chat_ids).
 * No DOM / localStorage dependencies — safe for React Native.
 */
export class MinibotWsClient {
  private socket: WebSocket | null = null;
  private statusHandlers = new Set<StatusHandler>();
  private errorHandlers = new Set<ErrorHandler>();
  private chatHandlers = new Map<string, Set<EventHandler>>();
  private pendingInboundByChat = new Map<string, InboundEvent[]>();
  private static readonly PENDING_INBOUND_MAX = 2000;
  private knownChats = new Set<string>();
  private pendingNewChat: PendingNewChat | null = null;
  private sendQueue: OutboundFrame[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly shouldReconnect: boolean;
  private readonly maxBackoffMs: number;
  private socketFactory: (url: string) => WebSocket;
  private currentUrl: string;
  private status_: ConnectionStatus = "idle";
  private readyChatId: string | null = null;
  private intentionallyClosed = false;
  private readonly debug: boolean;
  private onReauth: MinibotWsOptions["onReauth"];

  constructor(options: MinibotWsOptions) {
    this.shouldReconnect = options.reconnect ?? true;
    this.maxBackoffMs = options.maxBackoffMs ?? 15_000;
    this.debug = options.debug ?? false;
    this.currentUrl = options.url;
    this.onReauth = options.onReauth;
    const WSImpl = options.WebSocketImpl;
    this.socketFactory =
      options.socketFactory ??
      ((url: string) => {
        if (WSImpl) return new WSImpl(url);
        if (typeof WebSocket === "undefined") {
          throw new Error("WebSocket is not available; pass WebSocketImpl or socketFactory");
        }
        return new WebSocket(url);
      });
  }

  get status(): ConnectionStatus {
    return this.status_;
  }

  get defaultChatId(): string | null {
    return this.readyChatId;
  }

  updateUrl(url: string, socketFactory?: (url: string) => WebSocket): void {
    this.currentUrl = url;
    if (socketFactory) this.socketFactory = socketFactory;
  }

  onStatus(handler: StatusHandler): Unsubscribe {
    this.statusHandlers.add(handler);
    handler(this.status_);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  onError(handler: ErrorHandler): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  onChat(chatId: string, handler: EventHandler): Unsubscribe {
    let handlers = this.chatHandlers.get(chatId);
    if (!handlers) {
      handlers = new Set();
      this.chatHandlers.set(chatId, handlers);
    }
    handlers.add(handler);
    const pending = this.pendingInboundByChat.get(chatId);
    if (pending !== undefined && pending.length > 0) {
      const flushed = pending.splice(0);
      this.pendingInboundByChat.delete(chatId);
      for (const ev of flushed) handler(ev);
    }
    this.attach(chatId);
    return () => {
      const current = this.chatHandlers.get(chatId);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.chatHandlers.delete(chatId);
    };
  }

  connect(): void {
    if (this.socket && this.socket.readyState < WS_CLOSING) return;
    this.intentionallyClosed = false;
    this.setStatus("connecting");
    const sock = this.socketFactory(this.currentUrl);
    this.socket = sock;
    sock.onopen = () => this.handleOpen();
    sock.onmessage = (ev) => this.handleMessage(ev);
    sock.onerror = () => this.setStatus("error");
    sock.onclose = (ev) => this.handleClose(ev);
  }

  close(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const sock = this.socket;
    this.socket = null;
    try {
      sock?.close();
    } catch {
      // ignore
    }
    this.setStatus("closed");
  }

  newChat(
    timeoutMs: number = 5_000,
    workspaceScope?: WorkspaceScope | null,
  ): Promise<string> {
    if (this.pendingNewChat) {
      return Promise.reject(new Error("newChat already in flight"));
    }
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingNewChat = null;
        reject(new Error("newChat timed out"));
      }, timeoutMs);
      this.pendingNewChat = { resolve, reject, timer };
      this.queueSend({
        type: "new_chat",
        ...(workspaceScope ? { workspace_scope: workspaceScope } : {}),
      });
    });
  }

  attach(chatId: string): void {
    this.knownChats.add(chatId);
    if (this.socket?.readyState === WS_OPEN) {
      this.queueSend({ type: "attach", chat_id: chatId });
    }
  }

  sendMessage(
    chatId: string,
    content: string,
    options?: {
      media?: Array<{ data_url: string; name?: string }>;
      turnId?: string;
    },
  ): void {
    this.knownChats.add(chatId);
    this.queueSend({
      type: "message",
      chat_id: chatId,
      content,
      ...(options?.media?.length ? { media: options.media } : {}),
      ...(options?.turnId ? { turn_id: options.turnId } : {}),
      webui: true,
    });
  }

  /** Abort the in-flight agent turn for this chat. */
  abort(chatId: string): void {
    this.queueSend({ type: "abort", chat_id: chatId });
  }

  /** Send an arbitrary outbound frame (e.g. approval_response). */
  send(frame: OutboundFrame): void {
    this.queueSend(frame);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status_ === status) return;
    this.status_ = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  private handleOpen(): void {
    this.setStatus("open");
    this.reconnectAttempts = 0;
    for (const chatId of this.knownChats) {
      this.rawSend({ type: "attach", chat_id: chatId });
    }
    const queued = this.sendQueue.splice(0);
    for (const frame of queued) this.rawSend(frame);
  }

  private handleMessage(ev: MessageEvent): void {
    let parsed: InboundEvent & { detail?: string; reason?: string };
    try {
      parsed = JSON.parse(typeof ev.data === "string" ? ev.data : "") as InboundEvent & {
        detail?: string;
        reason?: string;
      };
    } catch {
      if (this.debug) console.warn("[minibot ws] invalid JSON");
      return;
    }
    if (this.debug) {
      console.log("[minibot ws]", parsed.event, (parsed as { chat_id?: string }).chat_id);
    }

    if (parsed.event === "ready") {
      const chatId = parsed.chat_id;
      this.readyChatId = chatId;
      this.knownChats.add(chatId);
      return;
    }

    if (parsed.event === "attached") {
      const chatId = parsed.chat_id;
      this.knownChats.add(chatId);
      if (this.pendingNewChat) {
        clearTimeout(this.pendingNewChat.timer);
        this.pendingNewChat.resolve(chatId);
        this.pendingNewChat = null;
      }
      this.dispatch(chatId, parsed);
      return;
    }

    if (parsed.event === "error" && parsed.detail === "workspace_scope_rejected") {
      this.emitError({
        kind: "workspace_scope_rejected",
        reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
        chatId: parsed.chat_id,
      });
      if (this.pendingNewChat) {
        clearTimeout(this.pendingNewChat.timer);
        this.pendingNewChat.reject(
          new Error(`workspace_scope_rejected:${parsed.reason || ""}`),
        );
        this.pendingNewChat = null;
      }
    }

    if (parsed.event === "error" && this.pendingNewChat) {
      clearTimeout(this.pendingNewChat.timer);
      const detail = typeof parsed.detail === "string" ? parsed.detail : "server error";
      this.pendingNewChat.reject(new Error(detail));
      this.pendingNewChat = null;
    }

    const chatId = parsed.chat_id;
    if (typeof chatId === "string" && chatId) this.dispatch(chatId, parsed);
  }

  private dispatch(chatId: string, ev: InboundEvent): void {
    const handlers = this.chatHandlers.get(chatId);
    if (handlers !== undefined && handlers.size > 0) {
      for (const h of handlers) h(ev);
      return;
    }
    let q = this.pendingInboundByChat.get(chatId);
    if (!q) {
      q = [];
      this.pendingInboundByChat.set(chatId, q);
    }
    q.push(ev);
    const over = q.length - MinibotWsClient.PENDING_INBOUND_MAX;
    if (over > 0) q.splice(0, over);
  }

  private handleClose(event?: { code?: number }): void {
    this.socket = null;
    if (this.pendingNewChat) {
      clearTimeout(this.pendingNewChat.timer);
      this.pendingNewChat.reject(new Error("socket closed"));
      this.pendingNewChat = null;
    }
    if (event?.code === 1009) this.emitError({ kind: "message_too_big" });
    if (this.intentionallyClosed || !this.shouldReconnect) {
      this.setStatus("closed");
      return;
    }
    this.scheduleReconnect();
  }

  private emitError(error: StreamError): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // ignore
      }
    }
  }

  private scheduleReconnect(): void {
    this.setStatus("reconnecting");
    const delay = Math.min(500 * 2 ** this.reconnectAttempts, this.maxBackoffMs);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnect();
    }, delay);
  }

  private async reconnect(): Promise<void> {
    if (this.onReauth) {
      try {
        const next = await this.onReauth();
        if (next) this.currentUrl = next;
      } catch {
        // keep old url
      }
    }
    this.connect();
  }

  setOnReauth(fn: MinibotWsOptions["onReauth"]): void {
    this.onReauth = fn;
  }

  private queueSend(frame: OutboundFrame): void {
    if (this.socket?.readyState === WS_OPEN) {
      this.rawSend(frame);
      return;
    }
    this.sendQueue.push(frame);
    if (!this.socket || this.socket.readyState >= WS_CLOSING) this.connect();
  }

  private rawSend(frame: OutboundFrame): void {
    try {
      this.socket?.send(JSON.stringify(frame));
    } catch {
      this.sendQueue.push(frame);
    }
  }
}
