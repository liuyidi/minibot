import { useCallback, useEffect, useState } from "react";

import {
  applyMcpTemplate,
  fetchMinibotMcpList,
  installSkill as apiInstallSkill,
  upsertMcpPresetJson,
  type MinibotMcpPreset,
  type MinibotMcpTemplate,
  type UpsertMcpPresetBody,
} from "@/lib/apis/api";
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
  mcpLoading: boolean;
  refreshMcp: () => Promise<void>;
  busyKey: string | null;
  error: string | null;
  clearError: () => void;
  applyTemplate: (templateId: string) => Promise<boolean>;
  /** Returns null on success, or an error message on failure. */
  installSkill: (body: { markdown: string; name?: string }) => Promise<string | null>;
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setMcpLoading(true);
      try {
        const payload = await fetchMinibotMcpList(token);
        if (cancelled) return;
        setPresets(payload.presets ?? []);
        setTemplates(payload.templates ?? []);
      } catch {
        if (cancelled) return;
        setPresets([]);
        setTemplates([]);
      } finally {
        if (!cancelled) setMcpLoading(false);
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
    mcpLoading,
    refreshMcp,
    busyKey,
    error,
    clearError,
    applyTemplate,
    installSkill,
    upsertMcp,
    importMcpConfig,
  };
}
