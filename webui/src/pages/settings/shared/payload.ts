import type {
  ImageGenerationSettingsUpdate,
  NetworkSafetySettingsUpdate,
  SettingsPayload,
  TranscriptionSettingsUpdate,
  WebSearchSettingsUpdate,
  WebuiDefaultAccessMode,
} from "@/lib/types";

import {
  DEFAULT_LOCAL_PREFS,
  DEFAULT_TRANSCRIPTION_SETTINGS,
  LOCAL_PREFS_STORAGE_KEY,
} from "./constants";
import type { LocalPreferences, PendingRestartSections } from "./types";

export function readLocalPreferences(): LocalPreferences {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_PREFS;
    const parsed = JSON.parse(raw) as Partial<LocalPreferences>;
    return {
      density: parsed.density === "compact" ? "compact" : "comfortable",
      activityMode: parsed.activityMode === "expanded" ? "expanded" : "auto",
      codeWrap: parsed.codeWrap !== false,
      brandLogos: parsed.brandLogos !== false,
    };
  } catch {
    return DEFAULT_LOCAL_PREFS;
  }
}

export function webSearchFormFromPayload(
  payload: SettingsPayload,
  previous?: WebSearchSettingsUpdate,
): WebSearchSettingsUpdate {
  return {
    provider: payload.web_search.provider,
    apiKey: previous?.provider === payload.web_search.provider ? previous.apiKey ?? "" : "",
    baseUrl: payload.web_search.base_url ?? "",
    maxResults: payload.web_search.max_results,
    timeout: payload.web_search.timeout,
    useJinaReader: payload.web.fetch.use_jina_reader,
  };
}

export function imageGenerationFormFromPayload(payload: SettingsPayload): ImageGenerationSettingsUpdate {
  return {
    enabled: payload.image_generation.enabled,
    provider: payload.image_generation.provider,
    model: payload.image_generation.model,
    defaultAspectRatio: payload.image_generation.default_aspect_ratio,
    defaultImageSize: payload.image_generation.default_image_size,
    maxImagesPerTurn: payload.image_generation.max_images_per_turn,
  };
}

export function transcriptionFormFromPayload(payload: SettingsPayload): TranscriptionSettingsUpdate {
  const transcription = payload.transcription ?? DEFAULT_TRANSCRIPTION_SETTINGS;
  return {
    enabled: transcription.enabled,
    provider: transcription.provider,
    model: transcription.model,
    language: transcription.language ?? "",
    maxDurationSec: transcription.max_duration_sec,
    maxUploadMb: transcription.max_upload_mb,
  };
}

export function networkSafetyFormFromPayload(payload: SettingsPayload): NetworkSafetySettingsUpdate {
  return {
    webuiAllowLocalServiceAccess:
      payload.advanced?.webui_allow_local_service_access ??
      payload.advanced?.allow_local_preview_access ??
      true,
    webuiDefaultAccessMode: visibleWebuiDefaultAccessMode(
      payload.advanced?.webui_default_access_mode,
    ),
  };
}

export function pendingRestartSectionsFromPayload(payload: SettingsPayload): PendingRestartSections {
  const sections = payload.restart_required_sections ?? [];
  return {
    runtime: sections.includes("runtime"),
    browser: sections.includes("browser"),
    image: sections.includes("image"),
  };
}

export function visibleWebuiDefaultAccessMode(mode: string | null | undefined): WebuiDefaultAccessMode {
  return mode === "full" ? "full" : "default";
}
