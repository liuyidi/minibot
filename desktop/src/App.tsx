import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type EngineStatus =
  | "starting"
  | "ready"
  | "restarting"
  | "stopped"
  | "crashed";

type HostRuntimeInfo = {
  surface: "native";
  app_version: string;
  engine_status: EngineStatus;
  data_dir: string;
  logs_dir: string;
  config_path: string;
  workspace_path: string;
  python: string;
  api_base: string;
};

type UiState =
  | { phase: "starting"; message: string }
  | { phase: "ready"; info: HostRuntimeInfo }
  | { phase: "error"; message: string };

export default function App() {
  const [state, setState] = useState<UiState>({
    phase: "starting",
    message: "正在启动 nanobot 引擎…",
  });
  const started = useRef(false);

  const boot = useCallback(async () => {
    setState({ phase: "starting", message: "正在启动 nanobot 引擎…" });
    try {
      const info = await invoke<HostRuntimeInfo>("start_engine");
      setState({
        phase: "starting",
        message: `引擎已就绪（${info.api_base}），正在打开 WebUI…`,
      });
      await invoke("open_webui");
      setState({ phase: "ready", info });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ phase: "error", message });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void boot();
  }, [boot]);

  return (
    <div className="shell">
      <div className="card">
        <h1 className="brand">nanobot</h1>
        <p className="subtitle">桌面引擎宿主会自动拉起本机 nanobot gateway，并打开原生 WebUI。</p>

        {state.phase === "starting" ? (
          <p className="status pending">{state.message}</p>
        ) : null}

        {state.phase === "ready" ? (
          <p className="status ok">
            已连接 {state.info.api_base}（nanobot: {state.info.python}）
          </p>
        ) : null}

        {state.phase === "error" ? (
          <>
            <p className="status err">{state.message}</p>
            <div className="actions">
              <button type="button" className="primary" onClick={() => void boot()}>
                重试启动
              </button>
            </div>
          </>
        ) : null}

        <div className="hint">
          需要本机已安装 <code>nanobot</code>（在 PATH 中），或设置环境变量{" "}
          <code>NANOBOT_BIN</code>。
          <br />
          桌面实例默认使用独立端口 <code>18765</code>，避免和手动{" "}
          <code>nanobot gateway</code>（8765）冲突。
        </div>
      </div>
    </div>
  );
}
