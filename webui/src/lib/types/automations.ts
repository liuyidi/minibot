/** Automations / cron job payloads for WebUI settings. */

export interface SessionAutomationJob {
  id: string;
  name: string;
  enabled: boolean;
  protected?: boolean;
  delete_after_run?: boolean;
  created_at_ms?: number | null;
  updated_at_ms?: number | null;
  schedule: {
    kind: "at" | "every" | "cron" | string;
    at_ms?: number | null;
    every_ms?: number | null;
    expr?: string | null;
    tz?: string | null;
  };
  payload: {
    message: string;
    kind?: "agent_turn" | "system_event" | string;
  };
  state: {
    next_run_at_ms?: number | null;
    last_run_at_ms?: number | null;
    last_status?: "ok" | "error" | "skipped" | string | null;
    last_error?: string | null;
    pending?: boolean;
    run_history?: Array<{
      run_at_ms: number;
      status: "ok" | "error" | "skipped" | string;
      duration_ms?: number;
      error?: string | null;
    }>;
  };
  origin?: {
    session_key?: string;
    channel: string;
    chat_id?: string;
    title?: string;
    preview?: string;
  } | null;
}

export interface SessionAutomationsPayload { jobs: SessionAutomationJob[]; }
export interface AutomationsPayload { jobs: SessionAutomationJob[]; }
export interface AutomationUpdatePayload {
  name?: string;
  message?: string;
  schedule?: {
    kind: "at" | "every" | "cron";
    at_ms?: number;
    every_ms?: number;
    expr?: string;
    tz?: string;
  };
}

export interface SessionDeleteResult {
  deleted: boolean;
  blocked_by_automations?: boolean;
  automations?: SessionAutomationJob[];
}
