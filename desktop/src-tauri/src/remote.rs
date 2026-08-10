use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use url::Url;

/// Production WebUI (release builds). Override anytime with `MINIBOT_API_BASE`.
pub const PRODUCTION_HTTPS_API_BASE: &str = "https://bot.liuyidi.me";
/// Local WebUI Vite (debug / `cargo`/`tauri` dev). Override with `MINIBOT_API_BASE`.
pub const LOCAL_DEV_API_BASE: &str = "http://127.0.0.1:5173";
/// Legacy demo HTTP fallback when HTTPS probe fails (ECS :8766).
pub const FALLBACK_HTTP_API_BASE: &str = "http://116.62.35.76:8766";

/// Default api_base: local Vite in debug, production HTTPS in release.
pub const DEFAULT_API_BASE: &str = if cfg!(debug_assertions) {
    LOCAL_DEV_API_BASE
} else {
    PRODUCTION_HTTPS_API_BASE
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineStatus {
    Starting,
    Ready,
    Restarting,
    Stopped,
    Crashed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct HostRuntimeInfo {
    pub surface: &'static str,
    pub app_version: String,
    pub engine_status: EngineStatus,
    pub data_dir: String,
    pub logs_dir: String,
    pub config_path: String,
    pub workspace_path: String,
    pub python: String,
    pub api_base: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerConfig {
    api_base: String,
}

pub struct RemoteServer {
    inner: Mutex<RemoteInner>,
}

struct RemoteInner {
    status: EngineStatus,
    api_base: String,
    data_dir: PathBuf,
    logs_dir: PathBuf,
    config_path: PathBuf,
    last_error: Option<String>,
    app_version: String,
}

impl RemoteServer {
    pub fn new(app_version: String, data_dir: PathBuf) -> Result<Self, String> {
        let logs_dir = data_dir.join("logs");
        std::fs::create_dir_all(&logs_dir).map_err(|e| format!("create logs dir: {e}"))?;
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;

        let config_path = data_dir.join("server.json");
        let api_base = resolve_initial_api_base(&config_path)?;

        Ok(Self {
            inner: Mutex::new(RemoteInner {
                status: EngineStatus::Stopped,
                api_base,
                data_dir,
                logs_dir,
                config_path,
                last_error: None,
                app_version,
            }),
        })
    }

    pub fn runtime_info(&self) -> Result<HostRuntimeInfo, String> {
        let g = self.inner.lock().map_err(|_| "remote state lock poisoned".to_string())?;
        Ok(runtime_info_from_inner(&g))
    }

    pub fn api_base(&self) -> Result<String, String> {
        let g = self.inner.lock().map_err(|_| "remote state lock poisoned".to_string())?;
        Ok(g.api_base.clone())
    }

    pub fn logs_dir(&self) -> Result<PathBuf, String> {
        let g = self.inner.lock().map_err(|_| "remote state lock poisoned".to_string())?;
        Ok(g.logs_dir.clone())
    }

    pub fn set_status(&self, status: EngineStatus) -> Result<(), String> {
        let mut g = self.inner.lock().map_err(|_| "remote state lock poisoned".to_string())?;
        g.status = status;
        Ok(())
    }

    pub fn set_api_base(&self, raw: &str) -> Result<HostRuntimeInfo, String> {
        let normalized = normalize_api_base(raw)?;
        {
            let mut g = self
                .inner
                .lock()
                .map_err(|_| "remote state lock poisoned".to_string())?;
            g.api_base = normalized;
            persist_server_config(&g.config_path, &g.api_base)?;
            g.last_error = None;
        }
        self.runtime_info()
    }

    pub fn connect(&self) -> Result<HostRuntimeInfo, String> {
        {
            let mut g = self
                .inner
                .lock()
                .map_err(|_| "remote state lock poisoned".to_string())?;
            g.status = EngineStatus::Starting;
            g.last_error = None;
            let _ = append_log(
                &g.logs_dir,
                &format!("connect start api_base={}", g.api_base),
            );
        }

        // Best-effort probe only. GUI WebView uses macOS system proxy; a direct
        // (--noproxy) probe can fail with HTTP 000 while the WebView still loads.
        match self.wait_until_ready(Duration::from_secs(6)) {
            Ok(()) => {}
            Err(primary_err) => {
                let current = self.api_base().unwrap_or_default();
                if should_try_http_fallback(&current) {
                    let _ = append_log_path(
                        &self.logs_dir().unwrap_or_default(),
                        &format!(
                            "HTTPS probe failed ({primary_err}); trying fallback {FALLBACK_HTTP_API_BASE}"
                        ),
                    );
                    let _ = self.set_api_base(FALLBACK_HTTP_API_BASE);
                    if let Err(fallback_err) = self.wait_until_ready(Duration::from_secs(6)) {
                        let _ = append_log_path(
                            &self.logs_dir().unwrap_or_default(),
                            &format!(
                                "probe still failing ({fallback_err}); opening WebView anyway"
                            ),
                        );
                    }
                } else {
                    let _ = append_log_path(
                        &self.logs_dir().unwrap_or_default(),
                        &format!("probe failed ({primary_err}); opening WebView anyway"),
                    );
                }
            }
        }

        self.set_status(EngineStatus::Ready)?;
        self.runtime_info()
    }

    pub fn reconnect(&self) -> Result<HostRuntimeInfo, String> {
        self.set_status(EngineStatus::Restarting)?;
        thread::sleep(Duration::from_millis(200));
        self.connect()
    }

    pub fn export_diagnostics(&self) -> Result<String, String> {
        let info = self.runtime_info()?;
        let g = self.inner.lock().map_err(|_| "remote state lock poisoned".to_string())?;
        let log_tail = read_log_tail(&g.logs_dir.join("connection.log"), 8_000);
        Ok(format!(
            "minibot-desktop diagnostics\n\
             app_version: {}\n\
             engine_status: {:?}\n\
             api_base: {}\n\
             backend: {}\n\
             last_error: {}\n\
             data_dir: {}\n\
             logs_dir: {}\n\
             --- connection.log (tail) ---\n\
             {}\n",
            info.app_version,
            info.engine_status,
            info.api_base,
            info.python,
            g.last_error.as_deref().unwrap_or("(none)"),
            info.data_dir,
            info.logs_dir,
            log_tail,
        ))
    }

    fn wait_until_ready(&self, timeout: Duration) -> Result<(), String> {
        let api_base = self.api_base()?;
        let probe = format!("{}/webui/bootstrap", api_base.trim_end_matches('/'));
        let started = Instant::now();
        let mut last_err = String::from("server did not become ready");

        // Prefer /usr/bin/curl with proxy env cleared. System HTTP(S)_PROXY (Clash
        // etc.) often breaks ureq and can hang bootstrap probes from a GUI app.
        while started.elapsed() < timeout {
            match probe_bootstrap(&probe) {
                Ok(()) => {
                    self.set_status(EngineStatus::Ready)?;
                    let _ = append_log_path(
                        &self.logs_dir().unwrap_or_default(),
                        &format!("bootstrap ok {probe}"),
                    );
                    return Ok(());
                }
                Err(err) => last_err = err,
            }
            thread::sleep(Duration::from_millis(400));
        }

        Err(format!(
            "timed out waiting for minibot at {probe}: {last_err}"
        ))
    }
}

fn probe_bootstrap(probe_url: &str) -> Result<(), String> {
    // Try direct first, then allow system/Clash proxy. WKWebView follows the
    // system proxy path, so a proxy-only success is still a good signal.
    match probe_curl(probe_url, /* bypass_proxy */ true) {
        Ok(()) => Ok(()),
        Err(direct_err) => match probe_curl(probe_url, false) {
            Ok(()) => Ok(()),
            Err(proxy_err) => Err(format!("direct: {direct_err}; proxy: {proxy_err}")),
        },
    }
}

fn probe_curl(probe_url: &str, bypass_proxy: bool) -> Result<(), String> {
    use std::process::Command;

    let mut cmd = Command::new("/usr/bin/curl");
    cmd.args([
        "-sS",
        "-o",
        "/dev/null",
        "-w",
        "%{http_code}",
        "--connect-timeout",
        "3",
        "--max-time",
        "5",
        "-H",
        "Accept: application/json",
    ]);
    if bypass_proxy {
        cmd.args(["--noproxy", "*"]);
        cmd.env_remove("ALL_PROXY")
            .env_remove("all_proxy")
            .env_remove("HTTP_PROXY")
            .env_remove("HTTPS_PROXY")
            .env_remove("http_proxy")
            .env_remove("https_proxy");
    }
    cmd.arg(probe_url);

    let output = cmd
        .output()
        .map_err(|e| format!("curl probe failed to start: {e}"))?;

    let code = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if matches!(code.as_str(), "200" | "401" | "403") {
        return Ok(());
    }
    if code == "000" || code.is_empty() {
        return Err(if stderr.is_empty() {
            format!("HTTP {code}")
        } else {
            format!("HTTP {code} ({stderr})")
        });
    }
    Err(format!("HTTP {code}"))
}

fn runtime_info_from_inner(g: &RemoteInner) -> HostRuntimeInfo {
    HostRuntimeInfo {
        surface: "native",
        app_version: g.app_version.clone(),
        engine_status: g.status,
        data_dir: g.data_dir.display().to_string(),
        logs_dir: g.logs_dir.display().to_string(),
        config_path: g.config_path.display().to_string(),
        workspace_path: String::new(),
        python: "remote".into(),
        api_base: g.api_base.clone(),
    }
}

fn resolve_initial_api_base(config_path: &Path) -> Result<String, String> {
    if let Ok(override_base) = std::env::var("MINIBOT_API_BASE") {
        let trimmed = override_base.trim();
        if !trimmed.is_empty() {
            return normalize_api_base(trimmed);
        }
    }
    if config_path.is_file() {
        let raw = std::fs::read_to_string(config_path)
            .map_err(|e| format!("read server.json: {e}"))?;
        if let Ok(cfg) = serde_json::from_str::<ServerConfig>(&raw) {
            if let Ok(normalized) = normalize_api_base(&cfg.api_base) {
                return Ok(normalized);
            }
        }
    }
    Ok(DEFAULT_API_BASE.to_string())
}

fn should_try_http_fallback(api_base: &str) -> bool {
    let lower = api_base.to_ascii_lowercase();
    lower.starts_with("https://") && lower.contains("bot.liuyidi.me")
}

fn append_log_path(logs_dir: &Path, line: &str) -> Result<(), String> {
    append_log(logs_dir, line)
}

fn persist_server_config(path: &Path, api_base: &str) -> Result<(), String> {
    let cfg = ServerConfig {
        api_base: api_base.to_string(),
    };
    let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("write server.json: {e}"))
}

pub fn normalize_api_base(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("api_base is empty".into());
    }
    let url = Url::parse(trimmed).map_err(|e| format!("invalid api_base URL: {e}"))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("api_base must be http or https".into());
    }
    if url.host_str().is_none() {
        return Err("api_base must include a host".into());
    }
    Ok(trimmed.to_string())
}

fn append_log(logs_dir: &Path, line: &str) -> Result<(), String> {
    std::fs::create_dir_all(logs_dir).map_err(|e| e.to_string())?;
    let path = logs_dir.join("connection.log");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open connection log: {e}"))?;
    writeln!(file, "[{}] {line}", chrono_now()).map_err(|e| e.to_string())
}

fn read_log_tail(path: &Path, max_bytes: usize) -> String {
    let Ok(bytes) = std::fs::read(path) else {
        return String::from("(no log)");
    };
    if bytes.len() <= max_bytes {
        return String::from_utf8_lossy(&bytes).into_owned();
    }
    String::from_utf8_lossy(&bytes[bytes.len() - max_bytes..]).into_owned()
}

fn chrono_now() -> String {
    use std::time::SystemTime;
    let Ok(dur) = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH) else {
        return "unknown".into();
    };
    format!("{}", dur.as_secs())
}

