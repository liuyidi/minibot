import { useEffect, useMemo, useState } from "react";

import { updateTranscriptionSettings } from "@/lib/apis/api";
import type { TranscriptionSettingsUpdate } from "@/lib/types";
import {
  DEFAULT_TRANSCRIPTION_FORM,
  DEFAULT_TRANSCRIPTION_SETTINGS,
  transcriptionFormFromPayload,
} from "@/pages/settings/shared";
import { useSettingsShell } from "../SettingsShellContext";

export function useVoiceSettings() {
  const {
    token,
    settings,
    applyPayload,
    setError,
    markPendingRestart,
    maybeRestartHostEngine,
    selectSection,
    localPrefs,
    pendingRestartSections,
    restartViaSettingsSurface,
    hostEngineApplying,
    isRestarting,
  } = useSettingsShell();

  const [transcriptionForm, setTranscriptionForm] = useState<TranscriptionSettingsUpdate>(() =>
    settings ? transcriptionFormFromPayload(settings) : DEFAULT_TRANSCRIPTION_FORM,
  );
  const [transcriptionSaving, setTranscriptionSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setTranscriptionForm(transcriptionFormFromPayload(settings));
  }, [settings]);

  const transcriptionDirty = useMemo(() => {
    if (!settings) return false;
    const transcription = settings.transcription ?? DEFAULT_TRANSCRIPTION_SETTINGS;
    return (
      transcriptionForm.enabled !== transcription.enabled ||
      transcriptionForm.provider !== transcription.provider ||
      transcriptionForm.model !== transcription.model ||
      transcriptionForm.language !== (transcription.language ?? "") ||
      transcriptionForm.maxDurationSec !== transcription.max_duration_sec ||
      transcriptionForm.maxUploadMb !== transcription.max_upload_mb
    );
  }, [settings, transcriptionForm]);

  const saveTranscriptionSettings = async () => {
    if (!settings || !transcriptionDirty || transcriptionSaving) return;
    setTranscriptionSaving(true);
    try {
      const payload = await updateTranscriptionSettings(token, transcriptionForm);
      applyPayload(payload);
      if (payload.requires_restart) markPendingRestart("browser");
      await maybeRestartHostEngine(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTranscriptionSaving(false);
    }
  };

  return {
    settings,
    transcriptionForm,
    setTranscriptionForm,
    transcriptionDirty,
    transcriptionSaving,
    saveTranscriptionSettings,
    selectSection,
    localPrefs,
    restartViaSettingsSurface,
    isRestarting: isRestarting || hostEngineApplying,
    requiresRestartPending: pendingRestartSections.browser,
  };
}
