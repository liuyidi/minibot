mod remote;

#[cfg(target_os = "macos")]
mod macos_chrome;

#[cfg(not(target_os = "macos"))]
mod macos_chrome {
    use tauri::{AppHandle, WebviewWindow};

    pub fn install_native_chrome(_app: &AppHandle, _window: &WebviewWindow) -> Result<(), String> {
        Ok(())
    }

    pub fn set_sidebar_open(_window: &WebviewWindow, _open: bool) -> Result<(), String> {
        Ok(())
    }

    pub fn set_dark_appearance(_dark: bool) -> Result<(), String> {
        Ok(())
    }
}

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use remote::{EngineStatus, HostRuntimeInfo, RemoteServer};
use tauri::{Emitter, Manager, RunEvent, Runtime, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, TitleBarStyle};

struct AppState {
    server: Arc<RemoteServer>,
}

static RECREATING_WINDOW: AtomicBool = AtomicBool::new(false);

const WINDOW_LABEL: &str = "main";

fn is_desktop_auth_done_link(deep_link: &str) -> bool {
    let Ok(url) = Url::parse(deep_link) else {
        return false;
    };
    if url.scheme() != "minibot" {
        return false;
    }
    let host = url.host_str().unwrap_or("");
    let path = url.path().trim_matches('/');
    (host == "auth" && path == "done")
        || (host.is_empty() && path == "auth/done")
        || path.ends_with("auth/done")
}
/// Overlay traffic-light inset (logical px). Single source for
/// `WindowBuilder::traffic_light_position` and post-chrome AppKit layout.
///
/// - **x**: close-button `origin.x`（越大越靠右）
/// - **y**: titlebar 容器高度增量（`按钮高 + y`），主要影响可点/可拖区域厚度，
///   **不是**整组上下位置的旋钮
/// - **CHROME_DOWN**: 红绿灯 + 三个图标整体下移（越大越靠下）
pub(crate) const TRAFFIC_LIGHT_X: f64 = 18.0;
pub(crate) const TRAFFIC_LIGHT_Y: f64 = 20.0;
/// Positive = move traffic lights and titlebar icons down together (logical px).
pub(crate) const CHROME_DOWN: f64 = 4.0;

fn install_native_chrome_on_main(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let app2 = app.clone();
    let win2 = window.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(err) = macos_chrome::install_native_chrome(&app2, &win2) {
            eprintln!("minibot-desktop-v2 native chrome: {err}");
        } else {
            eprintln!("minibot-desktop-v2: native titlebar accessory chrome installed");
        }
    });
}

fn host_bridge_script() -> String {
    r#"
(() => {
  const install = () => {
    if (window.minibotHost && typeof window.minibotHost.openLogin === "function") return;
    const invoke = window.__TAURI__?.core?.invoke
      || window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== "function") {
      setTimeout(install, 40);
      return;
    }
    const reconnect = () => invoke("host_reconnect");
    window.minibotHost = {
      getRuntimeInfo: () => invoke("host_get_runtime_info"),
      restartEngine: reconnect,
      reconnect,
      pickFolder: () => invoke("host_pick_folder"),
      openLogs: () => invoke("host_open_logs"),
      exportDiagnostics: () => invoke("host_export_diagnostics"),
      openLogin: (url) => invoke("host_open_login", { url }),
      openInBrowser: () => invoke("open_in_browser"),
      startWindowDrag: () => {
        const getCurrentWindow = window.__TAURI__?.window?.getCurrentWindow;
        if (typeof getCurrentWindow === "function") {
          return getCurrentWindow().startDragging();
        }
        return invoke("plugin:window|start_dragging");
      },
    };
    window.dispatchEvent(new Event("minibot-host-ready"));
  };
  install();
})();
"#
    .to_string()
}

/// Keep window title blank (page `<title>` otherwise repaints next to traffic lights)
/// and lock document scroll in the embedded WKWebView.
fn host_chrome_polish_script() -> String {
    r#"
(() => {
  try { document.title = ""; } catch (_) {}
  const id = "minibot-host-chrome-polish";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    html, body, #root {
      height: 100% !important;
      max-height: 100% !important;
      overflow: hidden !important;
      overscroll-behavior: none !important;
    }
    body {
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
    }
    html.native-host nav[aria-label] > div:first-child {
      padding-top: 3.75rem !important;
    }
  `;
  document.documentElement.appendChild(style);
})();
"#
    .to_string()
}

fn boot_overlay_script(_api_base: &str) -> String {
    // Production-facing gate: match WebUI BootLoadingScreen (white + quiet spinner).
    // Debug URL / Retry stay hidden until the page fails to paint.
    // Use r## so JS selectors like "#root" do not terminate the raw string.
    r##"
(() => {
  if (window.__minibotBoot) return;
  window.__minibotBoot = true;
  const host = document.createElement("div");
  host.id = "minibot-boot";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#ffffff;color:#080808;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;";
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:12px;";
  wrap.innerHTML = "<div id='mb-row' style='display:flex;align-items:center;gap:8px;color:#666666;font-size:14px'><span style='position:relative;display:inline-flex;height:8px;width:8px'><span style='position:absolute;inset:0;border-radius:9999px;background:rgba(8,8,8,.4);animation:mb-ping 1.2s cubic-bezier(0,0,.2,1) infinite'></span><span style='position:relative;display:inline-flex;height:8px;width:8px;border-radius:9999px;background:rgba(8,8,8,.6)'></span></span><span id='mb-msg'>Connecting…</span></div><div id='mb-actions' style='display:none;flex-direction:column;align-items:center;gap:10px;margin-top:8px'><p id='mb-err' style='margin:0;max-width:320px;text-align:center;color:#8a8a8a;font-size:12px;line-height:1.4'></p><button id='mb-retry' type='button' style='border:0;border-radius:9999px;padding:10px 18px;background:#080808;color:#fff;font:600 13px/1 -apple-system,sans-serif;cursor:pointer'>Retry</button></div>";
  const style = document.createElement("style");
  style.textContent = "@keyframes mb-ping{75%,100%{transform:scale(2);opacity:0}}";
  shadow.appendChild(style);
  box.appendChild(wrap);
  shadow.appendChild(box);
  const getInvoke = () => window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  wrap.querySelector("#mb-retry").onclick = () => {
    const i = getInvoke();
    if (typeof i === "function") i("host_reconnect");
    else location.reload();
  };
  const mount = () => {
    if (!document.getElementById("minibot-boot")) {
      (document.documentElement || document.body).appendChild(host);
    }
  };
  mount();
  const hide = () => {
    const root = document.getElementById("root");
    if (root && root.childElementCount > 0) host.remove();
  };
  const iv = setInterval(hide, 200);
  setTimeout(() => {
    clearInterval(iv);
    if (!document.getElementById("minibot-boot")) return;
    wrap.querySelector("#mb-msg").textContent = "Taking longer than expected";
    wrap.querySelector("#mb-err").textContent = "Check that the local engine started, then retry.";
    wrap.querySelector("#mb-actions").style.display = "flex";
  }, 15000);
})();
"##
    .to_string()
}

fn emit_status(app: &tauri::AppHandle, status: EngineStatus) {
    let _ = app.emit("engine-status", status);
}

fn remote_url(target: &str) -> Result<Url, String> {
    let t = target.trim();
    if let Ok(parsed) = Url::parse(t) {
        let has_non_root_path = {
            let path = parsed.path();
            !path.is_empty() && path != "/"
        };
        if has_non_root_path || parsed.query().is_some() || parsed.fragment().is_some() {
            return Ok(parsed);
        }
    }
    Url::parse(&format!("{}/", t.trim_end_matches('/'))).map_err(|e| e.to_string())
}

/// Overlay titlebar / traffic lights exist only on macOS.
fn with_platform_chrome<R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'_, R, M>,
) -> WebviewWindowBuilder<'_, R, M> {
    #[cfg(target_os = "macos")]
    {
        builder
            .title_bar_style(TitleBarStyle::Overlay)
            .traffic_light_position(LogicalPosition::new(TRAFFIC_LIGHT_X, TRAFFIC_LIGHT_Y))
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder
    }
}

fn open_splash(app: &tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window(WINDOW_LABEL).is_some() {
        return Ok(());
    }
    with_platform_chrome(
        WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            .title("")
            .on_document_title_changed(|window, _title| {
                let _ = window.set_title("");
            })
            .inner_size(1180.0, 760.0)
            .min_inner_size(860.0, 560.0)
            .resizable(true)
            .center(),
    )
    .initialization_script(host_bridge_script())
    .build()
    .map_err(|e| format!("create splash failed: {e}"))?;
    // Do NOT install AppKit chrome on the splash: sibling views on contentView
    // during the later navigate→http load can blank WKWebView permanently.
    Ok(())
}

/// Top-level navigation to remote WebUI (iframe from asset:// is blank on WKWebView).
/// Prefer `navigate` on the existing window — close+recreate races with ExitRequested
/// and can quit the whole app when the splash is the only window.
fn open_remote_webui(app: &tauri::AppHandle, api_base: &str) -> Result<(), String> {
    let parsed = remote_url(api_base)?;

    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.set_title("");
        eprintln!("minibot-desktop-v2: navigate → {parsed}");
        win.navigate(parsed)
            .map_err(|e| format!("navigate to remote WebUI failed: {e}"))?;
        let _ = win.show();
        let _ = win.set_focus();
        // Boot overlay is injected once in on_page_load(Finished) — avoid a second
        // delayed eval that flashes another loading surface.
        return Ok(());
    }

    let boot = boot_overlay_script(api_base);
    RECREATING_WINDOW.store(true, Ordering::SeqCst);
    let built = with_platform_chrome(
        WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(parsed))
            .title("")
            .on_document_title_changed(|window, _title| {
                let _ = window.set_title("");
            })
            .inner_size(1180.0, 760.0)
            .min_inner_size(860.0, 560.0)
            .resizable(true)
            .center(),
    )
    .initialization_script(boot)
    .initialization_script(host_bridge_script())
    .initialization_script(host_chrome_polish_script())
    .build()
    .map_err(|e| format!("create remote window failed: {e}"));

    match &built {
        Ok(win) => {
            let _ = win.show();
            let _ = win.set_focus();
            // Native chrome: only after PageLoad Finished (see on_page_load).
            let _ = win;
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(500));
                RECREATING_WINDOW.store(false, Ordering::SeqCst);
            });
        }
        Err(_) => {
            RECREATING_WINDOW.store(false, Ordering::SeqCst);
        }
    }

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
fn host_open_login(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("login url is empty".into());
    }
    app.opener()
        .open_url(trimmed, None::<&str>)
        .map_err(|e| format!("open login browser failed: {e}"))
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

#[tauri::command]
fn host_set_native_chrome_sidebar_open(
    app: tauri::AppHandle,
    open: bool,
) -> Result<(), String> {
    let Some(win) = app.get_webview_window(WINDOW_LABEL) else {
        return Ok(());
    };
    let win2 = win.clone();
    app.run_on_main_thread(move || {
        if let Err(err) = macos_chrome::set_sidebar_open(&win2, open) {
            eprintln!("minibot-desktop native chrome reposition: {err}");
        }
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn host_set_native_chrome_dark(app: tauri::AppHandle, dark: bool) -> Result<(), String> {
    app.run_on_main_thread(move || {
        if let Err(err) = macos_chrome::set_dark_appearance(dark) {
            eprintln!("minibot-desktop native chrome tint: {err}");
        }
    })
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let url = payload.url().to_string();
                eprintln!("minibot-desktop-v2: page load finished {url}");
                let _ = webview.eval(&host_bridge_script());
                let _ = webview.eval(&host_chrome_polish_script());
                // Only overlay AppKit chrome after the remote WebUI document is ready.
                // Installing during splash/navigate blanks WKWebView on macOS.
                let is_remote_http = url.starts_with("http://") || url.starts_with("https://");
                if is_remote_http {
                    let boot = boot_overlay_script(url.trim_end_matches('/'));
                    let _ = webview.eval(&boot);
                    let app = webview.app_handle().clone();
                    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
                        install_native_chrome_on_main(&app, &win);
                    }
                }
            }
        })
        .setup(|app| {
            eprintln!("minibot-desktop-v2: setup begin");
            let _ = std::io::Write::flush(&mut std::io::stderr());
            let version = app.package_info().version.to_string();
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(".").join("minibot-desktop-v2-data"));
            let server = match RemoteServer::new(version, data_dir) {
                Ok(server) => server,
                Err(err) => {
                    eprintln!("minibot-desktop-v2 setup warning: {err}");
                    return Err(std::io::Error::new(std::io::ErrorKind::Other, err).into());
                }
            };
            let server = Arc::new(server);
            app.manage(AppState {
                server: Arc::clone(&server),
            });

            {
                use tauri_plugin_deep_link::DeepLinkExt;
                #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
                {
                    if let Err(err) = app.deep_link().register_all() {
                        eprintln!("minibot-desktop-v2: deep-link register_all: {err}");
                    }
                }
                let handle = app.handle().clone();
                let server_for_link = Arc::clone(&server);
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let raw = url.as_str().to_string();
                        eprintln!("minibot-desktop-v2: deep link {raw}");
                        if !raw.starts_with("minibot://") {
                            continue;
                        }
                        // Browser success page: just focus the app (session arrives via HTTP handoff).
                        if is_desktop_auth_done_link(&raw) {
                            let handle2 = handle.clone();
                            let _ = handle.run_on_main_thread(move || {
                                if let Some(win) = handle2.get_webview_window(WINDOW_LABEL) {
                                    let _ = win.show();
                                    let _ = win.unminimize();
                                    let _ = win.set_focus();
                                }
                            });
                            continue;
                        }
                        let server2 = Arc::clone(&server_for_link);
                        let handle2 = handle.clone();
                        std::thread::spawn(move || {
                            match server2.complete_desktop_oauth(&raw) {
                                Ok(session_url) => {
                                    let handle3 = handle2.clone();
                                    let _ = handle2.run_on_main_thread(move || {
                                        if let Err(err) =
                                            open_remote_webui(&handle3, &session_url)
                                        {
                                            eprintln!(
                                                "minibot-desktop-v2: oauth navigate failed: {err}"
                                            );
                                        }
                                    });
                                }
                                Err(err) => {
                                    eprintln!("minibot-desktop-v2: oauth complete failed: {err}");
                                }
                            }
                        });
                    }
                });
            }

            open_splash(&app.handle())?;
            eprintln!("minibot-desktop-v2: splash opened");
            let _ = std::io::Write::flush(&mut std::io::stderr());

            // Rust owns auto-connect; splash is a quiet loading surface until navigate.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(250));
                match server.connect() {
                    Ok(info) => {
                        eprintln!(
                            "minibot-desktop-v2: auto-connect ok → {}",
                            info.api_base
                        );
                        let _ = std::io::Write::flush(&mut std::io::stderr());
                        let api_base = info.api_base.clone();
                        let handle2 = handle.clone();
                        let _ = handle.run_on_main_thread(move || {
                            if let Err(err) = open_remote_webui(&handle2, &api_base) {
                                eprintln!("minibot-desktop-v2: open_remote_webui failed: {err}");
                                let _ = handle2.emit("boot-error", err);
                            }
                        });
                    }
                    Err(err) => {
                        eprintln!("minibot-desktop-v2: auto-connect failed: {err}");
                        let _ = std::io::Write::flush(&mut std::io::stderr());
                        let _ = handle.emit("boot-error", err);
                    }
                }
            });
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
            host_open_login,
            host_set_native_chrome_sidebar_open,
            host_set_native_chrome_dark,
        ])
        .build(tauri::generate_context!())
        .expect("error while building minibot desktop v2")
        .run(|app_handle, event| {
            match event {
                RunEvent::ExitRequested { api, .. } => {
                    if RECREATING_WINDOW.load(Ordering::SeqCst) {
                        api.prevent_exit();
                    } else if let Some(state) = app_handle.try_state::<AppState>() {
                        let _ = state.server.stop_local_engine();
                    }
                }
                RunEvent::Exit => {
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        let _ = state.server.stop_local_engine();
                    }
                }
                _ => {}
            }
        });
}
