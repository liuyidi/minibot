import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createModelConfiguration,
  createAutomation,
  deleteSession,
  fetchFilePreview,
  fetchAutomations,
  fetchCliApps,
  fetchInstalledCliApps,
  fetchMcpPresets,
  fetchProviderModels,
  fetchSessionAutomations,
  fetchSettingsUsage,
  fetchSidebarState,
  fetchWebuiThread,
  fetchWorkspaces,
  listSessions,
  listSlashCommands,
  loginProviderOAuth,
  logoutProviderOAuth,
  runAutomationAction,
  runCliAppAction,
  updateAutomation,
  updateSidebarState,
  updateImageGenerationSettings,
  updateModelConfiguration,
  updateNetworkSafetySettings,
  updateProviderSettings,
  updateSettings,
  updateWebSearchSettings,
} from "@/lib/apis/api";
import {
  fetchSkillDetail,
  fetchSkills,
  installSkill,
} from "@/lib/apis/skills-api";

describe("webui API helpers", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ deleted: true, key: "websocket:chat-1", messages: [] }),
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("percent-encodes websocket keys when fetching webui-thread snapshot", async () => {
    await fetchWebuiThread("tok", "websocket:chat-1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/websocket%3Achat-1/webui-thread",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
        credentials: "same-origin",
      }),
    );
  });

  it("passes pagination params when fetching a WebUI thread page", async () => {
    await fetchWebuiThread("tok", "websocket:chat-1", {
      limit: 120,
      before: "abc+/=",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/websocket%3Achat-1/webui-thread?limit=120&before=abc%2B%2F%3D",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
        credentials: "same-origin",
      }),
    );
  });

  it("percent-encodes websocket keys and paths when fetching file previews", async () => {
    await fetchFilePreview("tok", "websocket:chat-1", "/tmp/project/hook.py:12");

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/websocket%3Achat-1/file-preview?path=%2Ftmp%2Fproject%2Fhook.py%3A12",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
        credentials: "same-origin",
      }),
    );
  });

  it("percent-encodes websocket keys when fetching session automations", async () => {
    await fetchSessionAutomations("tok", "websocket:chat-1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/websocket%3Achat-1/automations",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("fetches workspace automations", async () => {
    await fetchAutomations("tok");

    expect(fetch).toHaveBeenCalledWith(
      "/api/webui/automations",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes workspace automation actions", async () => {
    await runAutomationAction("tok", "disable", "job 1/2");

    expect(fetch).toHaveBeenCalledWith(
      "/api/webui/automations/job%201%2F2/disable",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes workspace automation deletes", async () => {
    await runAutomationAction("tok", "delete", "job 1/2");

    expect(fetch).toHaveBeenCalledWith(
      "/api/webui/automations/job%201%2F2",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes workspace automation updates", async () => {
    const values = {
      name: "每日测验",
      message: "Ask 今日 quiz",
      schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Shanghai" },
    } as const;
    await updateAutomation("tok", "job 1/2", values);

    expect(fetch).toHaveBeenCalledWith(
      "/api/webui/automations/job%201%2F2",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      }),
    );
  });

  it("creates workspace automations", async () => {
    const values = {
      name: "每日 AI 新闻推送",
      message: "汇总昨天值得关注的 AI 新闻",
      session_id: "chat-1",
      schedule: { kind: "cron" as const, expr: "0 9 * * *" },
      delete_after_run: false,
    };
    await createAutomation("tok", values);

    expect(fetch).toHaveBeenCalledWith(
      "/api/webui/automations",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      }),
    );
  });

  it("fetches the WebUI skill summary", async () => {
    await fetchSkills("tok");

    expect(fetch).toHaveBeenCalledWith(
      "/api/webui/skills",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("percent-encodes skill names when fetching skill details", async () => {
    await fetchSkillDetail("tok", "current web");

    expect(fetch).toHaveBeenCalledWith(
      "/api/webui/skills/current%20web",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("installs a skill via POST JSON body", async () => {
    await installSkill("tok", { markdown: "---\nname: x\n---\n\n# X\n", name: "x" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/webui/skills",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ markdown: "---\nname: x\n---\n\n# X\n", name: "x" }),
      }),
    );
  });

  it("percent-encodes websocket keys when deleting a session", async () => {
    await deleteSession("tok", "websocket:chat-1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/websocket%3Achat-1/delete",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("passes the automation cascade flag when deleting a session", async () => {
    await deleteSession("tok", "websocket:chat-1", { deleteAutomations: true });

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/websocket%3Achat-1/delete?delete_automations=true",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes settings updates as a JSON POST body", async () => {
    await updateSettings("tok", {
      modelPreset: "default",
      model: "openrouter/test",
      provider: "openrouter",
      contextWindowTokens: 262144,
      timezone: "Asia/Shanghai",
      botName: "minibot",
      botIcon: "nb",
      toolHintMaxLength: 120,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/update",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          model: "openrouter/test",
          provider: "openrouter",
          timezone: "Asia/Shanghai",
          bot_name: "minibot",
        }),
      }),
    );
  });

  it("fetches token usage through the lightweight settings endpoint", async () => {
    await fetchSettingsUsage("tok");

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/usage",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes model configuration creation", async () => {
    await createModelConfiguration("tok", {
      label: "Fast writing",
      provider: "openai",
      model: "openai/gpt-4.1-mini",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/model-configurations/create?label=Fast+writing&provider=openai&model=openai%2Fgpt-4.1-mini",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes model configuration updates", async () => {
    await updateModelConfiguration("tok", {
      name: "codex",
      label: "Codex",
      provider: "openai_codex",
      model: "openai-codex/gpt-5.5",
      contextWindowTokens: 65536,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/model-configurations/update?name=codex&label=Codex&provider=openai_codex&model=openai-codex%2Fgpt-5.5&context_window_tokens=65536",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("reports HTML API fallbacks as gateway mismatch errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => "<!doctype html><html></html>",
      }),
    );

    await expect(
      updateModelConfiguration("tok", {
        name: "codex",
        model: "openai-codex/gpt-5.5",
      }),
    ).rejects.toMatchObject({
      status: 200,
      message: "Gateway returned WebUI HTML instead of JSON. Restart minibot and try again.",
    });
  });

  it("surfaces API error response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "npm error ENOTEMPTY",
      }),
    );

    await expect(runCliAppAction("tok", "install", "hyperframes")).rejects.toMatchObject({
      status: 500,
      message: "npm error ENOTEMPTY",
    });
  });

  it("times out when an API request never responds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    const pending = expect(listSessions("tok")).rejects.toThrow(
      "Request timed out after 20000ms",
    );
    await vi.advanceTimersByTimeAsync(20_000);

    await pending;
  });

  it("serializes provider settings updates as a JSON POST body", async () => {
    await updateProviderSettings("tok", {
      provider: "openrouter",
      apiKey: "sk-or-test",
      apiBase: "https://openrouter.ai/api/v1",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/update",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          provider: "openrouter",
          api_key: "sk-or-test",
          api_base: "https://openrouter.ai/api/v1",
        }),
      }),
    );
  });

  it("fetches provider model lists", async () => {
    await fetchProviderModels("tok", "deepseek");

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/provider-models?provider=deepseek",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes provider OAuth login and logout actions", async () => {
    await loginProviderOAuth("tok", "openai_codex");
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/provider/oauth-login?provider=openai_codex",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );

    await logoutProviderOAuth("tok", "openai_codex");
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/provider/oauth-logout?provider=openai_codex",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes web search settings updates", async () => {
    await updateWebSearchSettings("tok", {
      provider: "searxng",
      baseUrl: "https://search.example.com",
      maxResults: 8,
      timeout: 45,
      useJinaReader: false,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/web-search/update?provider=searxng&base_url=https%3A%2F%2Fsearch.example.com&max_results=8&timeout=45&use_jina_reader=false",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes network safety settings updates", async () => {
    await updateNetworkSafetySettings("tok", {
      webuiAllowLocalServiceAccess: false,
      webuiDefaultAccessMode: "full",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/network-safety/update?webui_allow_local_service_access=false&webui_default_access_mode=full",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("serializes image generation settings updates", async () => {
    await updateImageGenerationSettings("tok", {
      enabled: true,
      provider: "openrouter",
      model: "openai/gpt-5.4-image-2",
      defaultAspectRatio: "16:9",
      defaultImageSize: "2K",
      maxImagesPerTurn: 3,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/image-generation/update?enabled=true&provider=openrouter&model=openai%2Fgpt-5.4-image-2&default_aspect_ratio=16%3A9&default_image_size=2K&max_images_per_turn=3",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("reads CLI Apps catalog and serializes actions", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        apps: [],
        installed_count: 0,
        catalog_updated_at: "2026-04-18",
      }),
    } as Response);

    await expect(fetchCliApps("tok")).resolves.toMatchObject({ apps: [] });
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/cli-apps",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );

    await runCliAppAction("tok", "install", "gimp");
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/cli-apps/install?name=gimp",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("reads installed CLI Apps without fetching the full catalog", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        apps: [],
        installed_count: 0,
        catalog_updated_at: null,
      }),
    } as Response);

    await expect(fetchInstalledCliApps("tok")).resolves.toMatchObject({ apps: [] });
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/cli-apps?installed_only=1",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("maps minibot MCP list payloads into catalog rows for mentions", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        presets: [
          {
            id: "context7",
            label: "Context7",
            enabled: true,
            type: "stdio",
            command: "npx",
          },
        ],
        runtime: { servers: [] },
        templates: [],
      }),
    } as Response);

    await expect(fetchMcpPresets("tok")).resolves.toMatchObject({
      presets: [
        expect.objectContaining({
          name: "context7",
          display_name: "Context7",
          required_fields: [],
          installed: true,
          configured: true,
        }),
      ],
      installed_count: 1,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/mcp-presets",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("reads and writes persisted sidebar state", async () => {
    const state = {
      schema_version: 1,
      pinned_keys: ["websocket:chat-1"],
      archived_keys: ["websocket:old"],
      title_overrides: { "websocket:chat-1": "Release" },
      project_name_overrides: { "/Users/me/nanobot": "Core" },
      tags_by_key: {},
      collapsed_groups: {},
      view: {
        density: "compact" as const,
        show_previews: false,
        show_timestamps: false,
        show_archived: true,
        sort: "updated_desc" as const,
      },
      updated_at: null,
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => state,
    } as Response);

    await expect(fetchSidebarState("tok")).resolves.toEqual(state);
    expect(fetch).toHaveBeenCalledWith(
      "/api/webui/sidebar-state",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );

    await updateSidebarState("tok", state);
    const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(String(url)).toBe("/api/webui/sidebar-state/update");
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(state),
      }),
    );
  });

  it("fetches workspace project state", async () => {
    const payload = {
      schema_version: 1,
      default_access_mode: "default" as const,
      default_scope: {
        project_path: "/tmp/workspace",
        project_name: "workspace",
        access_mode: "restricted" as const,
        restrict_to_workspace: true,
      },
      controls: {
        can_change_project: true,
        can_use_full_access: true,
      },
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => payload,
    } as Response);

    await expect(fetchWorkspaces("tok")).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      "/api/workspaces",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("maps generated session titles from the sessions list", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessions: [
          {
            key: "websocket:chat-1",
            created_at: "2026-05-01T10:00:00",
            updated_at: "2026-05-01T10:01:00",
            title: "优化 WebUI 标题",
            run_started_at: 1_700_000_000,
          },
        ],
      }),
    } as Response);

    await expect(listSessions("tok")).resolves.toMatchObject([
      {
        key: "websocket:chat-1",
        title: "优化 WebUI 标题",
        preview: "",
        runStartedAt: 1_700_000_000,
      },
    ]);
  });

  it("maps slash command metadata from the commands endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        commands: [
          {
            command: "/stop",
            title: "Stop current task",
            description: "Cancel the active task.",
            icon: "square",
          },
          {
            command: "/restart",
            title: "Restart minibot",
            description: "Restart the bot process.",
            icon: "rotate-cw",
          },
          {
            command: "/history",
            title: "Show conversation history",
            description: "Print the last N messages.",
            icon: "history",
            arg_hint: "[n]",
          },
        ],
      }),
    } as Response);

    await expect(listSlashCommands("tok")).resolves.toEqual([
      {
        command: "/history",
        title: "Show conversation history",
        description: "Print the last N messages.",
        icon: "history",
        argHint: "[n]",
      },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/commands",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });
});
