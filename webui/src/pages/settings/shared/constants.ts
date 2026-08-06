import type {
  ImageGenerationSettingsUpdate,
  NetworkSafetySettingsUpdate,
  TranscriptionSettingsUpdate,
  WebSearchSettingsUpdate,
} from "@/lib/types";

import type {
  LocalPreferences,
  PendingRestartSections,
  ProviderApiType,
} from "./types";

export const FALLBACK_TIMEZONES = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export const LOCAL_PREFS_STORAGE_KEY = "minibot-webui.settings-preferences";

export const DEFAULT_LOCAL_PREFS: LocalPreferences = {
  density: "comfortable",
  activityMode: "auto",
  codeWrap: true,
  brandLogos: true,
};

export const OPENAI_API_TYPE_OPTIONS: Array<{ value: ProviderApiType; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "chat_completions", label: "Chat Completions" },
  { value: "responses", label: "Responses" },
];

export const LOCAL_UNCONFIGURED_PROVIDER_ORDER = new Map(
  ["vllm", "ollama", "lm_studio", "atomic_chat", "ovms"].map((name, index) => [
    name,
    index,
  ]),
);

export const IMAGE_ASPECT_RATIO_OPTIONS = [
  "1:1",
  "3:4",
  "9:16",
  "4:3",
  "16:9",
  "3:2",
  "2:3",
  "21:9",
];
export const IMAGE_SIZE_OPTIONS = ["1K", "2K", "4K", "1024x1024", "1536x1024", "1024x1536"];

export const EMPTY_PENDING_RESTART_SECTIONS: PendingRestartSections = {
  runtime: false,
  browser: false,
  image: false,
};

export const DEFAULT_WEB_SEARCH_FORM: WebSearchSettingsUpdate = {
  provider: "duckduckgo",
  apiKey: "",
  baseUrl: "",
  maxResults: 5,
  timeout: 30,
  useJinaReader: true,
};

export const DEFAULT_IMAGE_GENERATION_FORM: ImageGenerationSettingsUpdate = {
  enabled: false,
  provider: "openrouter",
  model: "openai/gpt-5.4-image-2",
  defaultAspectRatio: "1:1",
  defaultImageSize: "1K",
  maxImagesPerTurn: 4,
};

export const DEFAULT_TRANSCRIPTION_FORM: TranscriptionSettingsUpdate = {
  enabled: true,
  provider: "groq",
  model: "",
  language: "",
  maxDurationSec: 120,
  maxUploadMb: 25,
};

export const DEFAULT_TRANSCRIPTION_SETTINGS: NonNullable<
  import("@/lib/types").SettingsPayload["transcription"]
> = {
  enabled: true,
  provider: "groq",
  provider_configured: false,
  model: "whisper-large-v3",
  language: null,
  max_duration_sec: 120,
  max_upload_mb: 25,
  providers: [],
};

export const DEFAULT_NETWORK_SAFETY_FORM: NetworkSafetySettingsUpdate = {
  webuiAllowLocalServiceAccess: true,
  webuiDefaultAccessMode: "default",
};
