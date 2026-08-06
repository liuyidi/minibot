/** Provider model-list catalog payloads. */

export interface ProviderModelInfo {
  id: string;
  label?: string | null;
  owned_by?: string | null;
  context_window?: number | null;
}

export interface ProviderModelsPayload {
  provider: string;
  label: string;
  status:
    | "available"
    | "unsupported"
    | "not_configured"
    | "missing_api_base"
    | "error";
  catalog_kind: "official" | "catalog" | "local" | "custom" | "unsupported";
  models: ProviderModelInfo[];
  model_count: number;
  message?: string | null;
  fetched_at?: number;
}
