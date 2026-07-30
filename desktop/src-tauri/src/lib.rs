mod engine;

use std::path::PathBuf;
use std::sync::Arc;

use engine::{EngineManager, EngineStatus, HostRuntimeInfo};
use tauri::{Emitter, Manager, RunEvent, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

struct AppState {
    engine: Arc<EngineManager>,
}

fn host_bridge_script() -> String {
    // Injected on every page load so remote WebUI (gateway) can call host APIs.
    r#"
(() => {
  if (window.nanobotHost) return;
  const invoke = window.__TAURI__?.core?.invoke
    || window.__TAURI_INTERNALS__?.invoke;
  const listen = window.__TAURI__?.event?.listen;
  if (typeof invoke !== "function") return;

  const statusListeners = new Set();
  if (typeof listen === "function") {
    listen("engine-status", (event) => {
      for (const listener of statusListeners) {
        try { listener(event.payload); } catch (_) {}
      }
    });
  }

  window.nanobotHost = {
    getRuntimeInfo: () => invoke("host_get_runtime_info"),
    restartEngine: () => invoke("host_restart_engine"),
    pickFolder: () => invoke("host_pick_folder"),
    openLogs: () => invoke("host_open_logs"),
    exportDiagnostics: () => invoke("host_export_diagnostics"),
    onRuntimeStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
  };
})();
"#
    .to_string()
}

fn emit_status(app: &tauri::AppHandle, status: EngineStatus) {
    let _ = app.emit("engine-status", status);
}

#[tauri::command]
fn host_get_runtime_info(state: State<'_, AppState>) -> Result<HostRuntimeInfo, String> {
    state.engine.runtime_info()
}

#[tauri::command]
async fn host_restart_engine(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<HostRuntimeInfo, String> {
    emit_status(&app, EngineStatus::Restarting);
    let engine = Arc::clone(&state.engine);
    let info = tauri::async_runtime::spawn_blocking(move || engine.restart())
        .await
        .map_err(|e| format!("restart task join error: {e}"))??;

    emit_status(&app, info.engine_status);
    if let Some(window) = app.get_webview_window("main") {
        let target = Url::parse(&info.api_base).map_err(|e| e.to_string())?;
        window.navigate(target).map_err(|e| format!("navigate failed: {e}"))?;
    }
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
    let logs_dir = state.engine.logs_dir()?;
    app.opener()
        .open_path(logs_dir.display().to_string(), None::<&str>)
        .map_err(|e| format!("open logs failed: {e}"))
}

#[tauri::command]
fn host_export_diagnostics(state: State<'_, AppState>) -> Result<String, String> {
    state.engine.export_diagnostics()
}

#[tauri::command]
async fn start_engine(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<HostRuntimeInfo, String> {
    emit_status(&app, EngineStatus::Starting);
    let engine = Arc::clone(&state.engine);
    let info = tauri::async_runtime::spawn_blocking(move || {
        let _ = engine::append_startup_banner(&engine.logs_dir()?);
        engine.start()
    })
    .await
    .map_err(|e| format!("start task join error: {e}"))??;

    emit_status(&app, info.engine_status);
    Ok(info)
}

#[tauri::command]
fn get_engine_info(state: State<'_, AppState>) -> Result<HostRuntimeInfo, String> {
    state.engine.runtime_info()
}

#[tauri::command]
fn open_webui(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let api_base = state.engine.api_base()?;
    let target = Url::parse(&api_base).map_err(|e| e.to_string())?;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;
    window
        .navigate(target)
        .map_err(|e| format!("navigate failed: {e}"))
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
                .unwrap_or_else(|_| PathBuf::from(".").join("nanobot-desktop-data"));
            let resource_dir = app.path().resource_dir().ok();
            // Never fail setup hard: Finder launches have minimal PATH; resolve nanobot lazily.
            let engine = match EngineManager::new(version, data_dir, resource_dir) {
                Ok(engine) => engine,
                Err(err) => {
                    eprintln!("nanobot-desktop setup warning: {err}");
                    return Err(std::io::Error::new(std::io::ErrorKind::Other, err).into());
                }
            };
            app.manage(AppState {
                engine: Arc::new(engine),
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(&host_bridge_script());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_engine,
            get_engine_info,
            open_webui,
            host_get_runtime_info,
            host_restart_engine,
            host_pick_folder,
            host_open_logs,
            host_export_diagnostics,
        ])
        .build(tauri::generate_context!())
        .expect("error while building nanobot desktop")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    state.engine.stop();
                }
            }
        });
}
