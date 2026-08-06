import { useEffect, useState } from "react";

import {
  fetchCliApps,
  fetchMcpPresets,
  importMcpConfig,
  runCliAppAction,
  runMcpPresetAction,
  saveCustomMcpServer,
  updateMcpServerTools,
} from "@/lib/apis/api";
import { notifyCliAppsChanged } from "@/lib/chat/cli-app-events";
import { notifyMcpPresetsChanged } from "@/lib/chat/mcp-preset-events";
import type { CliAppsPayload, McpPresetsPayload } from "@/lib/types";
import {
  DEFAULT_CUSTOM_MCP_FORM,
  type AppsKindFilter,
  type CustomMcpForm,
} from "@/pages/settings/shared";
import { useSettingsShell } from "../SettingsShellContext";

export function useAppsSettings() {
  const {
    token,
    markPendingRestart,
    maybeRestartHostEngine,
    localPrefs,
    pendingRestartSections,
    onBackToChat,
    restartViaSettingsSurface,
    hostEngineApplying,
    isRestarting,
  } = useSettingsShell();

  const [cliApps, setCliApps] = useState<CliAppsPayload | null>(null);
  const [mcpPresets, setMcpPresets] = useState<McpPresetsPayload | null>(null);
  const [cliAppsLoading, setCliAppsLoading] = useState(true);
  const [mcpPresetsLoading, setMcpPresetsLoading] = useState(true);
  const [cliAppsAction, setCliAppsAction] = useState<string | null>(null);
  const [mcpPresetAction, setMcpPresetAction] = useState<string | null>(null);
  const [appsQuery, setAppsQuery] = useState("");
  const [cliAppsMessage, setCliAppsMessage] = useState<string | null>(null);
  const [cliAppsError, setCliAppsError] = useState<string | null>(null);
  const [cliAppsFocusName, setCliAppsFocusName] = useState<string | null>(null);
  const [appsKindFilter, setAppsKindFilter] = useState<AppsKindFilter>("all");
  const [mcpMessage, setMcpMessage] = useState<string | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpFieldValues, setMcpFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [customMcpForm, setCustomMcpForm] = useState<CustomMcpForm>(DEFAULT_CUSTOM_MCP_FORM);
  const [mcpConfigImport, setMcpConfigImport] = useState("");

  useEffect(() => {
    let cancelled = false;
    setCliAppsLoading(true);
    fetchCliApps(token)
      .then((payload) => {
        if (!cancelled) {
          setCliApps(payload);
          setCliAppsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setCliAppsError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setCliAppsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setMcpPresetsLoading(true);
    fetchMcpPresets(token)
      .then((payload) => {
        if (!cancelled) {
          setMcpPresets(payload);
          setMcpError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setMcpError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setMcpPresetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleCliAppAction = async (
    action: "install" | "update" | "uninstall" | "test",
    name: string,
  ) => {
    const key = `${action}:${name}`;
    setCliAppsAction(key);
    setCliAppsMessage(null);
    setCliAppsError(null);
    try {
      const payload = await runCliAppAction(token, action, name);
      setCliApps(payload);
      if (action !== "test") {
        notifyCliAppsChanged(payload);
      }
      setCliAppsMessage(payload.last_action?.message ?? null);
      setCliAppsFocusName(action === "uninstall" ? null : name);
    } catch (err) {
      setCliAppsError((err as Error).message);
    } finally {
      setCliAppsAction(null);
    }
  };

  const handleMcpPresetAction = async (
    action: "enable" | "remove" | "test",
    name: string,
    values: Record<string, string> = {},
  ) => {
    const key = `${action}:${name}`;
    setMcpPresetAction(key);
    setMcpMessage(null);
    setMcpError(null);
    try {
      const payload = await runMcpPresetAction(token, action, name, values);
      setMcpPresets(payload);
      setMcpMessage(payload.last_action?.message ?? null);
      if (action !== "test") {
        notifyMcpPresetsChanged(payload);
      }
      if (payload.requires_restart) markPendingRestart("runtime");
      await maybeRestartHostEngine(payload);
      if (action === "enable") {
        setMcpFieldValues((prev) => ({ ...prev, [name]: {} }));
      }
    } catch (err) {
      setMcpError((err as Error).message);
    } finally {
      setMcpPresetAction(null);
    }
  };

  const handleSaveCustomMcp = async () => {
    const name = customMcpForm.name.trim();
    const key = `custom:${name || "new"}`;
    setMcpPresetAction(key);
    setMcpMessage(null);
    setMcpError(null);
    try {
      const payload = await saveCustomMcpServer(token, {
        name,
        transport: customMcpForm.transport,
        command: customMcpForm.command,
        args: customMcpForm.args,
        url: customMcpForm.url,
        env: customMcpForm.env,
        headers: customMcpForm.headers,
        tool_timeout: customMcpForm.toolTimeout,
      });
      setMcpPresets(payload);
      setMcpMessage(payload.last_action?.message ?? null);
      notifyMcpPresetsChanged(payload);
      if (payload.requires_restart) markPendingRestart("runtime");
      await maybeRestartHostEngine(payload);
      setCustomMcpForm((prev) => ({ ...DEFAULT_CUSTOM_MCP_FORM, transport: prev.transport }));
    } catch (err) {
      setMcpError((err as Error).message);
    } finally {
      setMcpPresetAction(null);
    }
  };

  const handleImportMcpConfig = async () => {
    setMcpPresetAction("import");
    setMcpMessage(null);
    setMcpError(null);
    try {
      const payload = await importMcpConfig(token, mcpConfigImport);
      setMcpPresets(payload);
      setMcpMessage(payload.last_action?.message ?? null);
      notifyMcpPresetsChanged(payload);
      if (payload.requires_restart) markPendingRestart("runtime");
      await maybeRestartHostEngine(payload);
      setMcpConfigImport("");
    } catch (err) {
      setMcpError((err as Error).message);
    } finally {
      setMcpPresetAction(null);
    }
  };

  const handleMcpToolsChange = async (name: string, enabledTools: string[]) => {
    setMcpPresetAction(`tools:${name}`);
    setMcpMessage(null);
    setMcpError(null);
    try {
      const payload = await updateMcpServerTools(token, name, enabledTools);
      setMcpPresets(payload);
      setMcpMessage(payload.last_action?.message ?? null);
      notifyMcpPresetsChanged(payload);
      if (payload.requires_restart) markPendingRestart("runtime");
      await maybeRestartHostEngine(payload);
    } catch (err) {
      setMcpError((err as Error).message);
    } finally {
      setMcpPresetAction(null);
    }
  };

  return {
    cliApps,
    mcpPresets,
    cliAppsLoading,
    mcpPresetsLoading,
    appsQuery,
    setAppsQuery,
    appsKindFilter,
    setAppsKindFilter,
    cliAppsAction,
    mcpPresetAction,
    cliAppsMessage,
    cliAppsError,
    cliAppsFocusName,
    mcpMessage,
    mcpError,
    mcpFieldValues,
    setMcpFieldValues,
    customMcpForm,
    setCustomMcpForm,
    mcpConfigImport,
    setMcpConfigImport,
    handleCliAppAction,
    handleMcpPresetAction,
    handleSaveCustomMcp,
    handleImportMcpConfig,
    handleMcpToolsChange,
    setCliAppsMessage,
    setCliAppsError,
    setMcpMessage,
    setMcpError,
    localPrefs,
    pendingRestartSections,
    onBackToChat,
    restartViaSettingsSurface,
    isRestarting: isRestarting || hostEngineApplying,
  };
}
