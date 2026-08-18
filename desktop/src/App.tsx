import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type HostRuntimeInfo = {
  api_base: string;
};

type UiState =
  | { phase: "connecting" }
  | { phase: "error"; message: string };

const DEFAULT_API_BASE = "http://127.0.0.1:8766";

export default function App() {
  const [state, setState] = useState<UiState>({ phase: "connecting" });
  const [draftBase, setDraftBase] = useState(DEFAULT_API_BASE);

  const retry = useCallback(async (apiBase?: string) => {
    setState({ phase: "connecting" });
    try {
      if (apiBase !== undefined) {
        const saved = await invoke<HostRuntimeInfo>("set_api_base", {
          apiBase: apiBase.trim() || DEFAULT_API_BASE,
        });
        setDraftBase(saved.api_base);
      }
      await invoke<HostRuntimeInfo>("connect_server");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ phase: "error", message });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const info = await invoke<HostRuntimeInfo>("get_server_info");
        if (!cancelled && info.api_base) setDraftBase(info.api_base);
      } catch {
        // Keep default while Rust auto-connect runs.
      }
    })();
    const unlisten = listen<string>("boot-error", (event) => {
      if (cancelled) return;
      setState({ phase: "error", message: event.payload || "Failed to start local engine" });
    });
    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, []);

  if (state.phase === "connecting") {
    return (
      <div className="boot">
        <div className="boot-row">
          <span className="boot-dot" aria-hidden>
            <span className="boot-dot-ping" />
            <span className="boot-dot-core" />
          </span>
          <span>Connecting…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="boot">
      <div className="error-panel">
        <p className="error-title">Couldn’t start minibot</p>
        <p className="error-message">{state.message}</p>
        <label className="label" htmlFor="api-base">
          Local gateway
        </label>
        <input
          id="api-base"
          type="url"
          value={draftBase}
          onChange={(event) => setDraftBase(event.target.value)}
          placeholder={DEFAULT_API_BASE}
        />
        <div className="actions">
          <button type="button" className="primary" onClick={() => void retry(draftBase)}>
            Retry
          </button>
          <button type="button" onClick={() => void invoke("host_open_logs")}>
            Open logs
          </button>
        </div>
      </div>
    </div>
  );
}
