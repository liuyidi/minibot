mod remote;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use remote::{EngineStatus, HostRuntimeInfo, RemoteServer};
use tauri::{
    Emitter, LogicalPosition, Manager, RunEvent, State, TitleBarStyle, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

struct AppState {
    server: Arc<RemoteServer>,
}

static RECREATING_WINDOW: AtomicBool = AtomicBool::new(false);

const WINDOW_LABEL: &str = "main";

fn host_bridge_script() -> String {
    r#"
(() => {
  if (window.minibotHost) return;
  const invoke = window.__TAURI__?.core?.invoke
    || window.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== "function") return;
  const reconnect = () => invoke("host_reconnect");
  window.minibotHost = {
    getRuntimeInfo: () => invoke("host_get_runtime_info"),
    restartEngine: reconnect,
    reconnect,
    pickFolder: () => invoke("host_pick_folder"),
    openLogs: () => invoke("host_open_logs"),
    exportDiagnostics: () => invoke("host_export_diagnostics"),
    openInBrowser: () => invoke("open_in_browser"),
  };
})();
"#
    .to_string()
}

fn boot_overlay_script(api_base: &str) -> String {
    let url = format!("{}/", api_base.trim_end_matches('/'));
    let url_js = serde_json::to_string(&url).unwrap_or_else(|_| "\"\"".into());
    // Use r## so JS selectors like "#root" do not terminate the raw string.
    format!(
        r##"
(() => {{
  if (window.__minibotBoot) return;
  window.__minibotBoot = true;
  const TARGET = {url_js};
  const host = document.createElement("div");
  host.id = "minibot-boot";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
  const shadow = host.attachShadow({{ mode: "open" }});
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0d10;color:#f4f6f8;font:14px/1.5 -apple-system,sans-serif;padding:24px;";
  const card = document.createElement("div");
  card.style.cssText = "width:min(520px,100%);background:#14181e;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:22px 20px;box-sizing:border-box;";
  card.innerHTML = "<h1 style='margin:0 0 8px;font-size:20px;color:#f4f6f8'>minibot</h1><p id='mb-msg' style='margin:0 0 10px;color:#9aa3ad'>Loading WebUI...</p><pre id='mb-err' style='margin:0 0 12px;color:#ff8b80;white-space:pre-wrap;font:12px monospace'></pre><p id='mb-url' style='margin:0 0 14px;color:#9aa3ad;font-size:12px;word-break:break-all'></p><button id='mb-retry' type='button' style='margin-right:8px;border:0;border-radius:10px;padding:10px 14px;background:#e8eef4;color:#111;font-weight:600'>Retry</button><button id='mb-browser' type='button' style='border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px 14px;background:transparent;color:#e8eef4;font-weight:600'>Open in browser</button>";
  box.appendChild(card);
  shadow.appendChild(box);
  card.querySelector("#mb-url").textContent = "URL: " + TARGET;
  const getInvoke = () => window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  card.querySelector("#mb-retry").onclick = () => {{
    const i = getInvoke();
    if (typeof i === "function") i("host_reconnect");
    else location.reload();
  }};
  card.querySelector("#mb-browser").onclick = () => {{
    const i = getInvoke();
    if (typeof i === "function") i("open_in_browser");
    else window.open(TARGET, "_blank");
  }};
  const mount = () => {{
    if (!document.getElementById("minibot-boot")) {{
      (document.documentElement || document.body).appendChild(host);
    }}
  }};
  mount();
  const hide = () => {{
    const root = document.getElementById("root");
    if (root && root.childElementCount > 0) host.remove();
  }};
  const iv = setInterval(hide, 300);
  setTimeout(() => {{
    clearInterval(iv);
    if (document.getElementById("minibot-boot")) {{
      card.querySelector("#mb-msg").textContent = "WebUI still blank (script/assets may be blocked)";
      card.querySelector("#mb-err").textContent =
        "url=" + location.href + "\\nreadyState=" + document.readyState;
    }}
  }}, 12000);
  window.addEventListener("error", (ev) => {{
    card.querySelector("#mb-msg").textContent = "Script error";
    card.querySelector("#mb-err").textContent += String(ev.message || ev) + "\\n";
  }});
}})();
"##
    )
}

fn emit_status(app: &tauri::AppHandle, status: EngineStatus) {
    let _ = app.emit("engine-status", status);
}

fn remote_url(api_base: &str) -> Result<Url, String> {
    Url::parse(&format!("{}/", api_base.trim_end_matches('/'))).map_err(|e| e.to_string())
}

fn open_splash(app: &tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window(WINDOW_LABEL).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("minibot")
        .inner_size(1180.0, 760.0)
        .min_inner_size(860.0, 560.0)
        .resizable(true)
        .center()
        .title_bar_style(TitleBarStyle::Overlay)
        .traffic_light_position(LogicalPosition::new(12.0, 10.0))
        .build()
        .map_err(|e| format!("create splash failed: {e}"))?;
    Ok(())
}

/// Top-level navigation to remote WebUI (iframe from asset:// is blank on WKWebView).
fn open_remote_webui(app: &tauri::AppHandle, api_base: &str) -> Result<(), String> {
    let parsed = remote_url(api_base)?;
    let boot = boot_overlay_script(api_base);
    RECREATING_WINDOW.store(true, Ordering::SeqCst);

    if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
        let _ = existing.close();
    }

    let built = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(parsed.clone()))
        .title("minibot")
        .inner_size(1180.0, 760.0)
        .min_inner_size(860.0, 560.0)
        .resizable(true)
        .center()
        .title_bar_style(TitleBarStyle::Overlay)
        .traffic_light_position(LogicalPosition::new(12.0, 10.0))
        .initialization_script(boot)
        .initialization_script(host_bridge_script())
        .build()
        .map_err(|e| format!("create remote window failed: {e}"));

    if let Ok(ref win) = built {
        let _ = win.show();
        let _ = win.set_focus();
    }

    RECREATING_WINDOW.store(false, Ordering::SeqCst);
    built.map(|_| ())
}

#[tauri::command]
fn host_get_runtime_info(state: State<'_, AppState>) -> Result<HostRuntimeInfo, String> {
    state.server.runtime_info()
}

#[tauri::command]
async fn host_reconnect(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<HostRuntimeInfo, String> {
    emit_status(&app, EngineStatus::Restarting);
    let server = Arc::clone(&state.server);
    let info = tauri::async_runtime::spawn_blocking(move || server.reconnect())
        .await
        .map_err(|e| format!("reconnect task join error: {e}"))??;
    emit_status(&app, info.engine_status);
    open_remote_webui(&app, &info.api_base)?;
    Ok(info)
}

#[tauri::command]
async fn host_pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .set_title("Choose project folder")
        .pick_folder(move |folder| {
            let _ = tx.send(folder);
        });
    let folder = rx
        .recv()
        .map_err(|_| "folder picker closed unexpectedly".to_string())?;
    Ok(folder.map(|path| path.to_string()))
}

#[tauri::command]
async fn host_open_logs(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let logs_dir = state.server.logs_dir()?;
    app.opener()
        .open_path(logs_dir.display().to_string(), None::<&str>)
        .map_err(|e| format!("open logs failed: {e}"))
}

#[tauri::command]
fn host_export_diagnostics(state: State<'_, AppState>) -> Result<String, String> {
    state.server.export_diagnostics()
}

#[tauri::command]
fn open_in_browser(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let api_base = state.server.api_base()?;
    let url = format!("{}/", api_base.trim_end_matches('/'));
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("open browser failed: {e}"))
}

#[tauri::command]
async fn connect_server(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<HostRuntimeInfo, String> {
    emit_status(&app, EngineStatus::Starting);
    let server = Arc::clone(&state.server);
    let info = tauri::async_runtime::spawn_blocking(move || server.connect())
        .await
        .map_err(|e| format!("connect task join error: {e}"))??;
    emit_status(&app, info.engine_status);
    open_remote_webui(&app, &info.api_base)?;
    Ok(info)
}

#[tauri::command]
fn get_server_info(state: State<'_, AppState>) -> Result<HostRuntimeInfo, String> {
    state.server.runtime_info()
}

#[tauri::command]
fn set_api_base(
    state: State<'_, AppState>,
    api_base: String,
) -> Result<HostRuntimeInfo, String> {
    state.server.set_api_base(&api_base)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = webview.eval(&host_bridge_script());
            }
        })
        .setup(|app| {
            let version = app.package_info().version.to_string();
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(".").join("minibot-desktop-data"));
            let server = match RemoteServer::new(version, data_dir) {
                Ok(server) => server,
                Err(err) => {
                    eprintln!("minibot-desktop setup warning: {err}");
                    return Err(std::io::Error::new(std::io::ErrorKind::Other, err).into());
                }
            };
            app.manage(AppState {
                server: Arc::new(server),
            });
            open_splash(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_server,
            get_server_info,
            set_api_base,
            open_in_browser,
            host_get_runtime_info,
            host_reconnect,
            host_pick_folder,
            host_open_logs,
            host_export_diagnostics,
        ])
        .build(tauri::generate_context!())
        .expect("error while building minibot desktop")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                if RECREATING_WINDOW.load(Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
        });
}
