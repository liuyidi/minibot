import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage as SettingsView } from "@/pages/settings";
import { ProfileUsagePanel } from "@/pages/settings/profile";
import { ClientProvider } from "@/providers/ClientProvider";
import { PROFILE_STORAGE_KEY } from "@/lib/profile";
import type { SettingsPayload } from "@/lib/types";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function settingsPayload(): SettingsPayload {
  return {
    agent: {
      model: "openai/gpt-4o",
      provider: "auto",
      resolved_provider: "openai",
      has_api_key: true,
      model_preset: "default",
      max_tokens: 8192,
      context_window_tokens: 65536,
      temperature: 0.1,
      reasoning_effort: null,
      timezone: "UTC",
      bot_name: "minibot",
      bot_icon: "nb",
      tool_hint_max_length: 40,
    },
    model_presets: [{
      name: "default",
      label: "Default",
      active: true,
      is_default: true,
      model: "openai/gpt-4o",
      provider: "auto",
      max_tokens: 8192,
      context_window_tokens: 65536,
      temperature: 0.1,
      reasoning_effort: null,
    }],
    providers: [],
    web_search: {
      provider: "duckduckgo",
      api_key_hint: null,
      base_url: null,
      max_results: 5,
      timeout: 30,
      providers: [{ name: "duckduckgo", label: "DuckDuckGo", credential: "none" }],
    },
    web: {
      enable: true,
      proxy: null,
      user_agent: null,
      search: { max_results: 5, timeout: 30 },
      fetch: { use_jina_reader: true },
    },
    image_generation: {
      enabled: false,
      provider: "openrouter",
      provider_configured: false,
      model: "openai/gpt-5.4-image-2",
      default_aspect_ratio: "1:1",
      default_image_size: "1K",
      max_images_per_turn: 4,
      save_dir: "generated",
      providers: [],
    },
    runtime: {
      config_path: "/tmp/config.json",
      workspace_path: "/tmp/workspace",
      gateway_host: "127.0.0.1",
      gateway_port: 18790,
      heartbeat: { enabled: true, interval_s: 1800, keep_recent_messages: 8 },
      dream: { schedule: "every 2h" },
      unified_session: false,
    },
    advanced: {
      restrict_to_workspace: false,
      webui_allow_local_service_access: true,
      webui_default_access_mode: "default",
      private_service_protection_enabled: true,
      ssrf_whitelist_count: 0,
      mcp_server_count: 0,
      exec_enabled: true,
      exec_sandbox: null,
      exec_path_prepend_set: false,
      exec_path_append_set: false,
    },
    requires_restart: false,
  };
}

function renderProfileSettings() {
  render(
    <ClientProvider client={{} as never} token="tok">
      <SettingsView
        theme="light"
        initialSection="profile"
        onToggleTheme={() => {}}
        onBackToChat={() => {}}
        onModelNameChange={() => {}}
      />
    </ClientProvider>,
  );
}

describe("profile settings", () => {
  beforeEach(() => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        displayName: "liuyidi",
        avatarSeed: "seed-red",
        localUserId: "local-abc",
        createdAt: "2026-08-11T00:00:00Z",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/settings") return jsonResponse(settingsPayload());
        if (url === "/auth/config") {
          return jsonResponse({
            auth_provider: "mini_auth",
            authenticated: true,
            account: {
              id: "user-demo",
              name: "demo",
              email: "demo@mini-auth.dev",
              created_at: "2026-08-11T00:00:00Z",
            },
          });
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }),
    );
  });

  afterEach(() => {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it("shows editable profile fields and hides token usage", async () => {
    renderProfileSettings();

    expect(await screen.findByRole("heading", { name: "liuyidi" })).toBeInTheDocument();
    expect(await screen.findByText("user-demo")).toBeInTheDocument();
    expect(screen.getByText("2026-08-11")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-usage-panel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Token activity")).not.toBeInTheDocument();
  });

  it("saves a nickname edit locally", async () => {
    const user = userEvent.setup();
    renderProfileSettings();

    await user.click(await screen.findByRole("button", { name: "liuyidi" }));
    const input = screen.getByRole("textbox", { name: "Nickname" });
    await user.clear(input);
    await user.type(input, "Studio");
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Studio" })).toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? "{}").displayName).toBe("Studio");
  });

  it("randomizes the default avatar seed", async () => {
    const user = userEvent.setup();
    renderProfileSettings();

    await screen.findByRole("heading", { name: "liuyidi" });
    await user.click(screen.getByRole("button", { name: "Randomize" }));

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? "{}").avatarSeed).not.toBe(
        "seed-red",
      );
    });
  });

  it("copies the user id", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderProfileSettings();

    await screen.findByText("user-demo");
    await user.click(screen.getByRole("button", { name: "Copy user ID" }));
    expect(writeText).toHaveBeenCalledWith("user-demo");
  });
});

describe("profile usage panel", () => {
  it("renders token stats and heatmap when mounted directly", () => {
    render(
      <ProfileUsagePanel
        usage={{
          days: [],
          total_tokens: 1_200_000,
          total_tokens_30d: 1000,
          total_tokens_365d: 1_200_000,
          peak_day_tokens: 80_000,
          current_streak_days: 3,
          longest_streak_days: 12,
          active_days_30d: 8,
          requests_30d: 40,
        }}
      />,
    );

    expect(screen.getByTestId("profile-usage-panel")).toBeInTheDocument();
    expect(screen.getByLabelText("Token activity")).toBeInTheDocument();
    expect(screen.getByText("Total tokens")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
  });
});
