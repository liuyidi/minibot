import { useCallback, useEffect, useState } from "react";

import {
  applyMcpTemplate,
  deleteMcpPreset as apiDeleteMcpPreset,
  fetchMcpPresets,
  fetchMinibotMcpList,
  setMcpPresetEnabled as apiSetMcpPresetEnabled,
  upsertMcpPresetJson,
  type MinibotMcpPreset,
  type MinibotMcpTemplate,
  type UpsertMcpPresetBody,
} from "@/lib/apis/api";
import {
  fetchSkillCatalog,
  installSkill as apiInstallSkill,
  installSkillFromCatalog as apiInstallSkillFromCatalog,
  setSkillEnabled as apiSetSkillEnabled,
  uninstallSkill as apiUninstallSkill,
  type SkillCatalogTemplate,
} from "@/lib/apis/skills-api";
import { notifyMcpPresetsChanged } from "@/lib/chat/mcp-preset-events";
import { parseMcpConfigImport } from "@/lib/skills/mcp-config-import";
import type { SkillSummary } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

import { useSkills } from "./useSkills";

export type UpsertMcpBody = UpsertMcpPresetBody;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Skills list + MCP connectors catalog for the Skills hub page. */
export function useSkillsCatalog(): {
  skills: SkillSummary[];
  skillsLoading: boolean;
  skillsError: string | null;
  refreshSkills: () => Promise<SkillSummary[]>;
  presets: MinibotMcpPreset[];
  templates: MinibotMcpTemplate[];
  skillTemplates: SkillCatalogTemplate[];
  skillCatalogLoading: boolean;
  mcpLoading: boolean;
  refreshMcp: () => Promise<void>;
  busyKey: string | null;
  error: string | null;
  clearError: () => void;
  applyTemplate: (templateId: string) => Promise<boolean>;
  applySkillTemplate: (templateId: string) => Promise<boolean>;
  applySkillTemplates: (templateIds: string[], busyKey?: string) => Promise<boolean>;
  /** Returns null on success, or an error message on failure. */
  installSkill: (body: { markdown: string; name?: string }) => Promise<string | null>;
  setSkillEnabled: (name: string, enabled: boolean) => Promise<string | null>;
  uninstallSkill: (name: string) => Promise<string | null>;
  setMcpEnabled: (presetId: string, enabled: boolean) => Promise<string | null>;
  uninstallMcp: (presetId: string) => Promise<string | null>;
  /** Returns null on success, or an error message on failure. */
  upsertMcp: (body: UpsertMcpBody) => Promise<string | null>;
  /** Parse mcp.json and upsert each server. Returns null on success. */
  importMcpConfig: (raw: string) => Promise<string | null>;
} {
  const { token } = useClient();
  const {
    skills,
    loading: skillsLoading,
    error: skillsError,
    refresh: refreshSkills,
  } = useSkills();

  const [presets, setPresets] = useState<MinibotMcpPreset[]>([]);
  const [templates, setTemplates] = useState<MinibotMcpTemplate[]>([]);
  const [skillTemplates, setSkillTemplates] = useState<SkillCatalogTemplate[]>([]);
  const [skillCatalogLoading, setSkillCatalogLoading] = useState(true);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refreshMcp = useCallback(async () => {
    setMcpLoading(true);
    try {
      const payload = await fetchMinibotMcpList(token);
      setPresets(payload.presets ?? []);
      setTemplates(payload.templates ?? []);
    } catch {
      setPresets([]);
      setTemplates([]);
    } finally {
      setMcpLoading(false);
    }
  }, [token]);

  const refreshSkillCatalog = useCallback(async () => {
    setSkillCatalogLoading(true);
    try {
      const payload = await fetchSkillCatalog(token);
      setSkillTemplates(payload.templates ?? []);
    } catch {
      setSkillTemplates([]);
    } finally {
      setSkillCatalogLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setMcpLoading(true);
      setSkillCatalogLoading(true);
      try {
        const [mcpPayload, skillPayload] = await Promise.all([
          fetchMinibotMcpList(token),
          fetchSkillCatalog(token),
        ]);
        if (cancelled) return;
        setPresets(mcpPayload.presets ?? []);
        setTemplates(mcpPayload.templates ?? []);
        setSkillTemplates(skillPayload.templates ?? []);
      } catch {
        if (cancelled) return;
        setPresets([]);
        setTemplates([]);
        setSkillTemplates([]);
      } finally {
        if (!cancelled) {
          setMcpLoading(false);
          setSkillCatalogLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const applyTemplate = useCallback(
    async (templateId: string) => {
      setBusyKey(`tpl:${templateId}`);
      setError(null);
      try {
        const payload = await applyMcpTemplate(token, {
          template_id: templateId,
          enable: true,
        });
        setPresets(payload.presets ?? []);
        setTemplates(payload.templates ?? []);
        return true;
      } catch (err) {
        setError(toErrorMessage(err));
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [token],
  );

  const applySkillTemplate = useCallback(
    async (templateId: string) => {
      setBusyKey(`skill-tpl:${templateId}`);
      setError(null);
      try {
        await apiInstallSkillFromCatalog(token, templateId);
        await refreshSkills();
        return true;
      } catch (err) {
        setError(toErrorMessage(err));
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [token, refreshSkills],
  );

  const applySkillTemplates = useCallback(
    async (templateIds: string[], key?: string) => {
      const ids = templateIds.map((id) => id.trim()).filter(Boolean);
      if (!ids.length) return true;
      setBusyKey(key || `skill-tpl:${ids[0]}`);
      setError(null);
      try {
        for (const templateId of ids) {
          await apiInstallSkillFromCatalog(token, templateId);
        }
        await refreshSkills();
        return true;
      } catch (err) {
        setError(toErrorMessage(err));
        await refreshSkills();
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [token, refreshSkills],
  );

  const installSkill = useCallback(
    async (body: { markdown: string; name?: string }) => {
      setBusyKey("install-skill");
      try {
        await apiInstallSkill(token, body);
        await refreshSkills();
        return null;
      } catch (err) {
        return toErrorMessage(err);
      } finally {
        setBusyKey(null);
      }
    },
    [token, refreshSkills],
  );

  const setSkillEnabled = useCallback(
    async (name: string, enabled: boolean) => {
      setBusyKey(`skill-enable:${name}`);
      setError(null);
      try {
        await apiSetSkillEnabled(token, name, enabled);
        await refreshSkills();
        return null;
      } catch (err) {
        const message = toErrorMessage(err);
        setError(message);
        return message;
      } finally {
        setBusyKey(null);
      }
    },
    [token, refreshSkills],
  );

  const uninstallSkill = useCallback(
    async (name: string) => {
      setBusyKey(`skill-uninstall:${name}`);
      setError(null);
      try {
        await apiUninstallSkill(token, name);
        await refreshSkills();
        return null;
      } catch (err) {
        const message = toErrorMessage(err);
        // Stale card after a failed/partial install — resync list either way.
        await refreshSkills().catch(() => undefined);
        setError(message);
        return message;
      } finally {
        setBusyKey(null);
      }
    },
    [token, refreshSkills],
  );

  const setMcpEnabled = useCallback(
    async (presetId: string, enabled: boolean) => {
      setBusyKey(`mcp-enable:${presetId}`);
      setError(null);
      try {
        const payload = await apiSetMcpPresetEnabled(token, presetId, enabled);
        setPresets(payload.presets ?? []);
        setTemplates(payload.templates ?? []);
        try {
          notifyMcpPresetsChanged(await fetchMcpPresets(token));
        } catch {
          /* chat catalog refresh is best-effort */
        }
        return null;
      } catch (err) {
        const message = toErrorMessage(err);
        setError(message);
        return message;
      } finally {
        setBusyKey(null);
      }
    },
    [token],
  );

  const uninstallMcp = useCallback(
    async (presetId: string) => {
      setBusyKey(`mcp-uninstall:${presetId}`);
      setError(null);
      try {
        const payload = await apiDeleteMcpPreset(token, presetId);
        setPresets(payload.presets ?? []);
        setTemplates(payload.templates ?? []);
        try {
          notifyMcpPresetsChanged(await fetchMcpPresets(token));
        } catch {
          /* chat catalog refresh is best-effort */
        }
        return null;
      } catch (err) {
        const message = toErrorMessage(err);
        setError(message);
        return message;
      } finally {
        setBusyKey(null);
      }
    },
    [token],
  );

  const upsertMcp = useCallback(
    async (body: UpsertMcpBody) => {
      setBusyKey("upsert-mcp");
      try {
        const payload = await upsertMcpPresetJson(token, body);
        setPresets(payload.presets ?? []);
        setTemplates(payload.templates ?? []);
        return null;
      } catch (err) {
        return toErrorMessage(err);
      } finally {
        setBusyKey(null);
      }
    },
    [token],
  );

  const importMcpConfig = useCallback(
    async (raw: string) => {
      setBusyKey("import-mcp");
      try {
        const bodies = parseMcpConfigImport(raw);
        let payload = await upsertMcpPresetJson(token, bodies[0]!);
        for (const body of bodies.slice(1)) {
          payload = await upsertMcpPresetJson(token, body);
        }
        setPresets(payload.presets ?? []);
        setTemplates(payload.templates ?? []);
        return null;
      } catch (err) {
        return toErrorMessage(err);
      } finally {
        setBusyKey(null);
      }
    },
    [token],
  );

  return {
    skills,
    skillsLoading,
    skillsError,
    refreshSkills,
    presets,
    templates,
    skillTemplates,
    skillCatalogLoading,
    mcpLoading,
    refreshMcp,
    busyKey,
    error,
    clearError,
    applyTemplate,
    applySkillTemplate,
    applySkillTemplates,
    installSkill,
    setSkillEnabled,
    uninstallSkill,
    setMcpEnabled,
    uninstallMcp,
    upsertMcp,
    importMcpConfig,
  };
}
