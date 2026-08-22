use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use url::Url;

/// Local gateway default (desktop). Override with `MINIBOT_API_BASE`.
pub const LOCAL_GATEWAY_API_BASE: &str = "http://127.0.0.1:8766";

/// Default api_base for desktop: always the local gateway.
pub const DEFAULT_API_BASE: &str = LOCAL_GATEWAY_API_BASE;

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
    child: Option<Child>,
    sidecar_label: String,
}

impl RemoteServer {
    pub fn new(app_version: String, data_dir: PathBuf) -> Result<Self, String> {
        let logs_dir = data_dir.join("logs");
        std::fs::create_dir_all(&logs_dir).map_err(|e| format!("create logs dir: {e}"))?;
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;
        let engine_dir = data_dir.join("engine");
        std::fs::create_dir_all(&engine_dir).map_err(|e| format!("create engine dir: {e}"))?;

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
                child: None,
                sidecar_label: "none".into(),
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

        // If local gateway is not up yet, spawn sidecar / PATH minibot.
        if self.wait_until_ready(Duration::from_secs(2)).is_err() {
            if let Err(spawn_err) = self.ensure_local_engine() {
                let _ = append_log_path(
                    &self.logs_dir().unwrap_or_default(),
                    &format!("engine spawn failed: {spawn_err}"),
                );
                {
                    let mut g = self
                        .inner
                        .lock()
                        .map_err(|_| "remote state lock poisoned".to_string())?;
                    g.status = EngineStatus::Crashed;
                    g.last_error = Some(spawn_err.clone());
                }
                return Err(spawn_err);
            }
            if let Err(ready_err) = self.wait_until_ready(Duration::from_secs(90)) {
                {
                    let mut g = self
                        .inner
                        .lock()
                        .map_err(|_| "remote state lock poisoned".to_string())?;
                    g.status = EngineStatus::Crashed;
                    g.last_error = Some(ready_err.clone());
                }
                return Err(ready_err);
            }
        }

        self.set_status(EngineStatus::Ready)?;
        self.runtime_info()
    }

    pub fn reconnect(&self) -> Result<HostRuntimeInfo, String> {
        self.set_status(EngineStatus::Restarting)?;
        self.stop_local_engine()?;
        thread::sleep(Duration::from_millis(200));
        self.connect()
    }

    pub fn stop_local_engine(&self) -> Result<(), String> {
        let mut g = self
            .inner
            .lock()
            .map_err(|_| "remote state lock poisoned".to_string())?;
        if let Some(mut child) = g.child.take() {
            let _ = append_log(&g.logs_dir, "stopping local engine");
            let _ = child.kill();
            let _ = child.wait();
        }
        g.status = EngineStatus::Stopped;
        g.sidecar_label = "none".into();
        Ok(())
    }

    pub fn complete_desktop_oauth(&self, deep_link: &str) -> Result<String, String> {
        let (code, oauth_state) = parse_desktop_auth_callback(deep_link)?;
        let api_base = self.api_base()?;
        let complete_url = format!(
            "{}/auth/desktop/complete",
            api_base.trim_end_matches('/')
        );
        let payload = serde_json::json!({
            "code": code,
            "state": oauth_state,
        });
        let body = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
        let response = curl_json_post(&complete_url, &body)?;
        let token = response
            .get("token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "desktop complete missing token".to_string())?
            .to_string();
        let next_url = response
            .get("next_url")
            .and_then(|v| v.as_str())
            .unwrap_or("/");
        let session_url = format!(
            "{}/auth/desktop/session?token={}&next={}",
            api_base.trim_end_matches('/'),
            urlencoding_encode(&token),
            urlencoding_encode(next_url),
        );
        let _ = append_log_path(
            &self.logs_dir().unwrap_or_default(),
            "desktop oauth complete → session handoff",
        );
        Ok(session_url)
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
             sidecar: {}\n\
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

    fn ensure_local_engine(&self) -> Result<(), String> {
        {
            let g = self
                .inner
                .lock()
                .map_err(|_| "remote state lock poisoned".to_string())?;
            if g.child.is_some() {
                return Ok(());
            }
        }

        let (bin, label) = resolve_sidecar_command()?;
        let (_data_dir, logs_dir, api_base) = {
            let g = self
                .inner
                .lock()
                .map_err(|_| "remote state lock poisoned".to_string())?;
            (g.data_dir.clone(), g.logs_dir.clone(), g.api_base.clone())
        };

        let server_data_dir = minibot_home_dir();
        std::fs::create_dir_all(&server_data_dir)
            .map_err(|e| format!("create minibot home dir: {e}"))?;
        let (host, port) = host_port_from_api_base(&api_base)?;
        let stdout_path = logs_dir.join("engine.stdout.log");
        let stderr_path = logs_dir.join("engine.stderr.log");
        let stdout_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&stdout_path)
            .map_err(|e| format!("open engine stdout log: {e}"))?;
        let stderr_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&stderr_path)
            .map_err(|e| format!("open engine stderr log: {e}"))?;

        let _ = append_log(
            &logs_dir,
            &format!("spawning local engine label={label} bin={bin} {host}:{port}"),
        );

        let mut cmd = Command::new(&bin);
        cmd.env("MINIBOT_SERVER_HOST", &host)
            .env("MINIBOT_SERVER_PORT", port.to_string())
            .env("MINIBOT_SERVER_DATA_DIR", &server_data_dir)
            // Match design: local gateway uses hosted mini-auth (not tokenIssueSecret).
            .env("MINIBOT_SERVER_AUTH_PROVIDER", "mini_auth")
            .env(
                "MINIBOT_SERVER_MINI_AUTH_BASE_URL",
                std::env::var("MINIBOT_SERVER_MINI_AUTH_BASE_URL")
                    .unwrap_or_else(|_| "https://auth.liuyidi.me".into()),
            )
            .env("MINIBOT_SERVER_REQUIRE_AUTH", "true")
            .env(
                "MINIBOT_SERVER_PLATFORM_PROXY_BASE_URL",
                std::env::var("MINIBOT_SERVER_PLATFORM_PROXY_BASE_URL")
                    .unwrap_or_else(|_| "https://bot.liuyidi.me".into()),
            )
            .stdout(Stdio::from(stdout_file))
            .stderr(Stdio::from(stderr_file));

        // Optional local .env.models for BYOK/dev only — shipped clients use
        // PLATFORM_PROXY_BASE_URL (vendor keys stay on bot.liuyidi.me).
        let models_loaded = apply_dotenv_files(
            &mut cmd,
            &[
                std::env::var_os("MINIBOT_ENV_MODELS").map(PathBuf::from),
                Some(server_data_dir.join(".env.models")),
                Some(server_data_dir.join(".env")),
            ],
        );
        if models_loaded > 0 {
            let _ = append_log(
                &logs_dir,
                &format!("loaded {models_loaded} env vars from .env.models/.env"),
            );
        } else {
            let _ = append_log(
                &logs_dir,
                "no platform .env.models under ~/.minibot (demo models need keys)",
            );
        }

        let child = cmd.spawn().map_err(|e| {
            format!(
                "无法启动本地引擎（{label}）。请安装 minibot 或设置 MINIBOT_SIDECAR。详情: {e}"
            )
        })?;

        let mut g = self
            .inner
            .lock()
            .map_err(|_| "remote state lock poisoned".to_string())?;
        g.child = Some(child);
        g.sidecar_label = label;
        Ok(())
    }

    fn wait_until_ready(&self, timeout: Duration) -> Result<(), String> {
        let api_base = self.api_base()?;
        let probe = format!("{}/webui/bootstrap", api_base.trim_end_matches('/'));
        let started = Instant::now();
        let mut last_err = String::from("server did not become ready");

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

        Err(format!("等待本地引擎超时（{probe}）: {last_err}"))
    }
}

impl Drop for RemoteServer {
    fn drop(&mut self) {
        let _ = self.stop_local_engine();
    }
}

/// Load KEY=VALUE pairs from dotenv-style files into ``cmd`` (later files win).
/// Skips keys already present in the parent process environment.
/// Returns how many keys were applied.
fn apply_dotenv_files(cmd: &mut Command, paths: &[Option<PathBuf>]) -> usize {
    let mut merged: Vec<(String, String)> = Vec::new();
    for path in paths.iter().flatten() {
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        for (key, value) in parse_dotenv(&text) {
            if let Some((_, existing)) = merged.iter_mut().find(|(k, _)| k == &key) {
                *existing = value;
            } else {
                merged.push((key, value));
            }
        }
    }
    let mut applied = 0usize;
    for (key, value) in merged {
        if std::env::var_os(&key).is_some() {
            continue;
        }
        cmd.env(&key, &value);
        applied += 1;
    }
    applied
}

fn parse_dotenv(text: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line).trim();
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        let value = value.trim();
        let value = if (value.starts_with('"') && value.ends_with('"') && value.len() >= 2)
            || (value.starts_with('\'') && value.ends_with('\'') && value.len() >= 2)
        {
            value[1..value.len() - 1].to_string()
        } else {
            value.to_string()
        };
        if value.is_empty() {
            continue;
        }
        out.push((key.to_string(), value));
    }
    out
}

fn parse_desktop_auth_callback(deep_link: &str) -> Result<(String, String), String> {
    let url = Url::parse(deep_link).map_err(|e| format!("invalid deep link: {e}"))?;
    if url.scheme() != "minibot" {
        return Err(format!("unexpected deep link scheme: {}", url.scheme()));
    }
    let host = url.host_str().unwrap_or("");
    let path = url.path().trim_matches('/');
    // Accept minibot://auth/callback and minibot:///auth/callback
    let is_callback = (host == "auth" && path == "callback")
        || (host.is_empty() && path == "auth/callback")
        || path.ends_with("auth/callback");
    if !is_callback {
        return Err(format!("unsupported deep link path: {deep_link}"));
    }
    let mut code = None;
    let mut state = None;
    for (key, value) in url.query_pairs() {
        if key == "code" {
            code = Some(value.into_owned());
        } else if key == "state" {
            state = Some(value.into_owned());
        }
    }
    match (code, state) {
        (Some(c), Some(s)) if !c.is_empty() && !s.is_empty() => Ok((c, s)),
        _ => Err("deep link missing code/state".into()),
    }
}

fn curl_json_post(url: &str, body: &str) -> Result<serde_json::Value, String> {
    let output = Command::new("/usr/bin/curl")
        .args([
            "-sS",
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-H",
            "Accept: application/json",
            "--noproxy",
            "*",
            "--connect-timeout",
            "5",
            "--max-time",
            "30",
            "-d",
            body,
            url,
        ])
        .env_remove("ALL_PROXY")
        .env_remove("all_proxy")
        .env_remove("HTTP_PROXY")
        .env_remove("HTTPS_PROXY")
        .env_remove("http_proxy")
        .env_remove("https_proxy")
        .output()
        .map_err(|e| format!("curl POST failed to start: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("curl POST failed: {stderr}"));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(text.trim()).map_err(|e| format!("invalid complete JSON: {e}; body={text}"))
}

fn urlencoding_encode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for b in raw.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn resolve_sidecar_command() -> Result<(String, String), String> {
    if let Ok(path) = std::env::var("MINIBOT_SIDECAR") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return Ok((trimmed.to_string(), "MINIBOT_SIDECAR".into()));
        }
    }
    if let Some(path) = bundled_sidecar_path() {
        return Ok((path.to_string_lossy().into_owned(), "bundled".into()));
    }
    if which_command("minibot") {
        return Ok(("minibot".into(), "PATH:minibot".into()));
    }
    Err(
        "未找到本地引擎。请打包 sidecar、将 minibot 加入 PATH，或设置 MINIBOT_SIDECAR。"
            .into(),
    )
}

/// Locate PyInstaller onedir launcher bundled via Tauri `resources`.
fn bundled_sidecar_path() -> Option<PathBuf> {
    let names = ["minibot-sidecar", "minibot-sidecar.exe"];
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            dirs.push(exe_dir.join("minibot-sidecar"));
            dirs.push(exe_dir.to_path_buf());
            // macOS .app: Contents/MacOS → Contents/Resources/…
            if let Some(contents) = exe_dir.parent() {
                let resources = contents.join("Resources");
                // Prefer flattened target from tauri.conf resource map.
                dirs.push(resources.join("minibot-sidecar"));
                // Default Tauri layout keeps the source folder name:
                // resources/minibot-sidecar → Resources/resources/minibot-sidecar
                dirs.push(resources.join("resources").join("minibot-sidecar"));
                dirs.push(resources.clone());
            }
            // Linux/Windows: resources next to the executable
            dirs.push(exe_dir.join("resources").join("minibot-sidecar"));
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.join("src-tauri/resources/minibot-sidecar"));
        dirs.push(cwd.join("resources/minibot-sidecar"));
    }

    for dir in dirs {
        for name in names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn which_command(name: &str) -> bool {
    #[cfg(windows)]
    {
        Command::new("where")
            .arg(name)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        Command::new("which")
            .arg(name)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

fn host_port_from_api_base(api_base: &str) -> Result<(String, u16), String> {
    let url = Url::parse(api_base).map_err(|e| format!("invalid api_base: {e}"))?;
    let host = url
        .host_str()
        .ok_or_else(|| "api_base missing host".to_string())?
        .to_string();
    let port = url.port_or_known_default().unwrap_or(8766);
    Ok((host, port))
}

fn probe_bootstrap(probe_url: &str) -> Result<(), String> {
    match probe_curl(probe_url, /* bypass_proxy */ true) {
        Ok(()) => Ok(()),
        Err(direct_err) => match probe_curl(probe_url, false) {
            Ok(()) => Ok(()),
            Err(proxy_err) => Err(format!("direct: {direct_err}; proxy: {proxy_err}")),
        },
    }
}

fn probe_curl(probe_url: &str, bypass_proxy: bool) -> Result<(), String> {
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

fn minibot_home_dir() -> PathBuf {
    if let Ok(raw) = std::env::var("MINIBOT_HOME") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .map(|home| home.join(".minibot"))
        .unwrap_or_else(|| PathBuf::from(".minibot"))
}

fn runtime_info_from_inner(g: &RemoteInner) -> HostRuntimeInfo {
    let server_data = minibot_home_dir();
    HostRuntimeInfo {
        surface: "native",
        app_version: g.app_version.clone(),
        engine_status: g.status,
        data_dir: server_data.display().to_string(),
        logs_dir: g.logs_dir.display().to_string(),
        config_path: g.config_path.display().to_string(),
        workspace_path: server_data.join("workspace").display().to_string(),
        python: g.sidecar_label.clone(),
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
