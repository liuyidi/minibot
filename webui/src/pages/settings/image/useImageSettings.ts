import { useEffect, useMemo, useState } from "react";

import { updateImageGenerationSettings } from "@/lib/apis/api";
import type { ImageGenerationSettingsUpdate } from "@/lib/types";
import {
  DEFAULT_IMAGE_GENERATION_FORM,
  imageGenerationFormFromPayload,
} from "@/pages/settings/shared";
import { useSettingsShell } from "../SettingsShellContext";

export function useImageSettings() {
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

  const [imageGenerationForm, setImageGenerationForm] = useState<ImageGenerationSettingsUpdate>(
    () => (settings ? imageGenerationFormFromPayload(settings) : DEFAULT_IMAGE_GENERATION_FORM),
  );
  const [imageGenerationSaving, setImageGenerationSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setImageGenerationForm(imageGenerationFormFromPayload(settings));
  }, [settings]);

  const imageGenerationDirty = useMemo(() => {
    if (!settings) return false;
    return (
      imageGenerationForm.enabled !== settings.image_generation.enabled ||
      imageGenerationForm.provider !== settings.image_generation.provider ||
      imageGenerationForm.model !== settings.image_generation.model ||
      imageGenerationForm.defaultAspectRatio !== settings.image_generation.default_aspect_ratio ||
      imageGenerationForm.defaultImageSize !== settings.image_generation.default_image_size ||
      imageGenerationForm.maxImagesPerTurn !== settings.image_generation.max_images_per_turn
    );
  }, [imageGenerationForm, settings]);

  const saveImageGenerationSettings = async () => {
    if (!settings || !imageGenerationDirty || imageGenerationSaving) return;
    setImageGenerationSaving(true);
    try {
      const payload = await updateImageGenerationSettings(token, imageGenerationForm);
      applyPayload(payload);
      if (payload.requires_restart) markPendingRestart("image");
      await maybeRestartHostEngine(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImageGenerationSaving(false);
    }
  };

  return {
    settings,
    imageGenerationForm,
    setImageGenerationForm,
    imageGenerationDirty,
    imageGenerationSaving,
    saveImageGenerationSettings,
    selectSection,
    localPrefs,
    restartViaSettingsSurface,
    isRestarting: isRestarting || hostEngineApplying,
    requiresRestartPending: pendingRestartSections.image,
  };
}
