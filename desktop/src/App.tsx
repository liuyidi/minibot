import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type HostRuntimeInfo = {
  api_base: string;
};

type UiState =
  | { phase: "connecting"; message: string }
  | { phase: "error"; message: string };

const DEFAULT_API_BASE = import.meta.env.DEV
  ? "http://127.0.0.1:5173"
  : "https://bot.liuyidi.me";

export default function App() {
  const [state, setState] = useState<UiState>({
    phase: "connecting",
    message: "正在连接 minibot 服务…",
  });
  const [draftBase, setDraftBase] = useState(DEFAULT_API_BASE);
  const started = useRef(false);

  const connect = useCallback(async (apiBase?: string) => {
    setState({ phase: "connecting", message: "正在连接 minibot 服务…" });
    try {
      if (apiBase !== undefined) {
        const saved = await invoke<HostRuntimeInfo>("set_api_base", {
          apiBase: apiBase.trim() || DEFAULT_API_BASE,
        });
        setDraftBase(saved.api_base);
      } else {
        const info = await invoke<HostRuntimeInfo>("get_server_info");
        setDraftBase(info.api_base || DEFAULT_API_BASE);
      }

      setState({
        phase: "connecting",
        message: "正在打开 WebUI…",
      });
      // Rust replaces this window with WebviewUrl::External(remote).
      await invoke<HostRuntimeInfo>("connect_server");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ phase: "error", message });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void connect();
  }, [connect]);

  return (
    <div className="shell">
      <div className="card">
        <h1 className="brand">minibot</h1>
        <p className="subtitle">桌面端连接远程 minibot，并在应用窗口内打开 WebUI。</p>

        {state.phase === "connecting" ? (
          <p className="status pending">{state.message}</p>
        ) : null}

        {state.phase === "error" ? (
          <>
            <p className="status err">{state.message}</p>
            <label className="label" htmlFor="api-base">
              服务地址
            </label>
            <div className="row">
              <input
                id="api-base"
                type="url"
                value={draftBase}
                onChange={(event) => setDraftBase(event.target.value)}
                placeholder={DEFAULT_API_BASE}
              />
            </div>
            <div className="actions">
              <button
                type="button"
                className="primary"
                onClick={() => void connect(draftBase)}
              >
                保存并重试
              </button>
              <button type="button" onClick={() => void invoke("open_in_browser")}>
                浏览器打开
              </button>
            </div>
          </>
        ) : null}

        <div className="hint">
          默认 <code>{DEFAULT_API_BASE}</code>。可用 <code>MINIBOT_API_BASE</code>{" "}
          覆盖。不会使用 iframe（在 Tauri 里会白屏）。
        </div>
      </div>
    </div>
  );
}
