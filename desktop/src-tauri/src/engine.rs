use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

pub const DEFAULT_WEBSOCKET_PORT: u16 = 18_765;
pub const DEFAULT_HEALTH_PORT: u16 = 18_766;

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

pub struct EngineManager {
    inner: Mutex<EngineInner>,
    launcher: PathBuf,
}

struct EngineInner {
    child: Option<Child>,
    status: EngineStatus,
    websocket_port: u16,
    health_port: u16,
    api_base: String,
    data_dir: PathBuf,
    logs_dir: PathBuf,
    config_path: PathBuf,
    workspace_path: PathBuf,
    /// Resolved lazily — Finder-launched apps have a minimal PATH.
    nanobot_bin: Option<PathBuf>,
    app_version: String,
}

impl EngineManager {
    pub fn new(
        app_version: String,
        data_dir: PathBuf,
        resource_dir: Option<PathBuf>,
    ) -> Result<Self, String> {
        let logs_dir = data_dir.join("logs");
        std::fs::create_dir_all(&logs_dir).map_err(|e| format!("create logs dir: {e}"))?;
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;

        let home = dirs::home_dir().ok_or_else(|| "home directory not found".to_string())?;
        let config_path = home.join(".nanobot").join("config.json");
        let workspace_path = home.join(".nanobot").join("workspace");
        let launcher = launcher_script_path(resource_dir.as_deref())?;

        let websocket_port = DEFAULT_WEBSOCKET_PORT;
        let health_port = DEFAULT_HEALTH_PORT;
        let api_base = format!("http://127.0.0.1:{websocket_port}");

        Ok(Self {
            inner: Mutex::new(EngineInner {
                child: None,
                status: EngineStatus::Stopped,
                websocket_port,
                health_port,
                api_base,
                data_dir,
                logs_dir,
                config_path,
                workspace_path,
                nanobot_bin: None,
                app_version,
            }),
            launcher,
        })
    }

    pub fn runtime_info(&self) -> Result<HostRuntimeInfo, String> {
        let g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
        Ok(HostRuntimeInfo {
            surface: "native",
            app_version: g.app_version.clone(),
            engine_status: g.status,
            data_dir: g.data_dir.display().to_string(),
            logs_dir: g.logs_dir.display().to_string(),
            config_path: g.config_path.display().to_string(),
            workspace_path: g.workspace_path.display().to_string(),
            python: g
                .nanobot_bin
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "(unresolved)".into()),
            api_base: g.api_base.clone(),
        })
    }

    pub fn api_base(&self) -> Result<String, String> {
        let g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
        Ok(g.api_base.clone())
    }

    pub fn logs_dir(&self) -> Result<PathBuf, String> {
        let g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
        Ok(g.logs_dir.clone())
    }

    pub fn set_status(&self, status: EngineStatus) -> Result<(), String> {
        let mut g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
        g.status = status;
        Ok(())
    }

    pub fn start(&self) -> Result<HostRuntimeInfo, String> {
        {
            let mut g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
            if matches!(g.status, EngineStatus::Starting | EngineStatus::Ready | EngineStatus::Restarting)
                && g.child.as_mut().is_some_and(|c| c.try_wait().ok().flatten().is_none())
            {
                return Ok(runtime_info_from_inner(&g));
            }
            g.status = EngineStatus::Starting;
            stop_child(&mut g.child);
        }

        self.spawn_process()?;
        self.wait_until_ready(Duration::from_secs(45))?;
        self.runtime_info()
    }

    pub fn restart(&self) -> Result<HostRuntimeInfo, String> {
        self.set_status(EngineStatus::Restarting)?;
        {
            let mut g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
            stop_child(&mut g.child);
            g.status = EngineStatus::Restarting;
        }
        thread::sleep(Duration::from_millis(400));
        self.spawn_process()?;
        self.wait_until_ready(Duration::from_secs(45))?;
        self.runtime_info()
    }

    pub fn stop(&self) {
        if let Ok(mut g) = self.inner.lock() {
            stop_child(&mut g.child);
            g.status = EngineStatus::Stopped;
        }
    }

    pub fn export_diagnostics(&self) -> Result<String, String> {
        let info = self.runtime_info()?;
        let log_tail = read_log_tail(&PathBuf::from(&info.logs_dir).join("engine.log"), 8_000);
        Ok(format!(
            "nanobot-desktop diagnostics\n\
             app_version: {}\n\
             engine_status: {:?}\n\
             api_base: {}\n\
             nanobot: {}\n\
             config: {}\n\
             workspace: {}\n\
             data_dir: {}\n\
             logs_dir: {}\n\
             --- engine.log (tail) ---\n\
             {}\n",
            info.app_version,
            info.engine_status,
            info.api_base,
            info.python,
            info.config_path,
            info.workspace_path,
            info.data_dir,
            info.logs_dir,
            log_tail,
        ))
    }

    fn spawn_process(&self) -> Result<(), String> {
        let nanobot_bin = self.ensure_nanobot_bin()?;
        let mut g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
        let log_path = g.logs_dir.join("engine.log");
        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| format!("open engine log: {e}"))?;
        let log_err = log_file
            .try_clone()
            .map_err(|e| format!("clone engine log: {e}"))?;

        let mut cmd = build_gateway_command(
            &nanobot_bin,
            &self.launcher,
            g.websocket_port,
            g.health_port,
        )?;
        cmd.stdin(Stdio::null())
            .stdout(Stdio::from(log_file))
            .stderr(Stdio::from(log_err));

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    // Put the gateway in its own process group so we can kill the tree.
                    if libc::setpgid(0, 0) != 0 {
                        return Err(std::io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn nanobot gateway: {e}"))?;
        g.child = Some(child);
        g.status = EngineStatus::Starting;
        Ok(())
    }

    fn ensure_nanobot_bin(&self) -> Result<PathBuf, String> {
        {
            let g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
            if let Some(path) = g.nanobot_bin.as_ref() {
                if path.is_file() {
                    return Ok(path.clone());
                }
            }
        }
        let resolved = resolve_nanobot_bin()?;
        let mut g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
        g.nanobot_bin = Some(resolved.clone());
        Ok(resolved)
    }

    fn wait_until_ready(&self, timeout: Duration) -> Result<(), String> {
        let api_base = self.api_base()?;
        let probe = format!("{}/webui/bootstrap", api_base.trim_end_matches('/'));
        let started = Instant::now();
        let mut last_err = String::from("engine did not become ready");

        while started.elapsed() < timeout {
            {
                let mut g = self.inner.lock().map_err(|_| "engine state lock poisoned".to_string())?;
                if let Some(child) = g.child.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            g.status = EngineStatus::Crashed;
                            g.child = None;
                            return Err(format!(
                                "nanobot gateway exited early ({status}). Check logs in {}",
                                g.logs_dir.display()
                            ));
                        }
                        Ok(None) => {}
                        Err(e) => {
                            g.status = EngineStatus::Crashed;
                            return Err(format!("failed to poll gateway process: {e}"));
                        }
                    }
                }
            }

            match ureq::get(&probe)
                .timeout(Duration::from_secs(2))
                .call()
            {
                Ok(response) => {
                    let code = response.status();
                    if code == 200 || code == 401 || code == 403 {
                        self.set_status(EngineStatus::Ready)?;
                        return Ok(());
                    }
                    last_err = format!("bootstrap returned HTTP {code}");
                }
                Err(ureq::Error::Status(code, _)) => {
                    if code == 401 || code == 403 {
                        self.set_status(EngineStatus::Ready)?;
                        return Ok(());
                    }
                    last_err = format!("bootstrap returned HTTP {code}");
                }
                Err(e) => {
                    last_err = e.to_string();
                }
            }
            thread::sleep(Duration::from_millis(400));
        }

        self.set_status(EngineStatus::Crashed)?;
        let logs = self.logs_dir().unwrap_or_default();
        Err(format!(
            "timed out waiting for gateway at {probe}: {last_err}. See {}",
            logs.join("engine.log").display()
        ))
    }
}

fn runtime_info_from_inner(g: &EngineInner) -> HostRuntimeInfo {
    HostRuntimeInfo {
        surface: "native",
        app_version: g.app_version.clone(),
        engine_status: g.status,
        data_dir: g.data_dir.display().to_string(),
        logs_dir: g.logs_dir.display().to_string(),
        config_path: g.config_path.display().to_string(),
        workspace_path: g.workspace_path.display().to_string(),
        python: g
            .nanobot_bin
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "(unresolved)".into()),
        api_base: g.api_base.clone(),
    }
}

fn stop_child(child: &mut Option<Child>) {
    let Some(mut child) = child.take() else {
        return;
    };
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        unsafe {
            libc::kill(-pid, libc::SIGTERM);
        }
        let _ = child.wait();
        return;
    }
    #[cfg(not(unix))]
    {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn resolve_nanobot_bin() -> Result<PathBuf, String> {
    if let Ok(override_path) = std::env::var("NANOBOT_BIN") {
        let path = PathBuf::from(override_path.trim());
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!("NANOBOT_BIN does not exist: {}", path.display()));
    }

    // Finder/LaunchServices apps get a minimal PATH. Probe login shells + common installs.
    for candidate in candidate_nanobot_paths() {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(path) = shell_which("zsh", &["-lic", "command -v nanobot"]) {
            return Ok(path);
        }
        if let Some(path) = shell_which("bash", &["-lc", "command -v nanobot"]) {
            return Ok(path);
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(path) = shell_which("bash", &["-lc", "command -v nanobot"]) {
            return Ok(path);
        }
    }

    #[cfg(windows)]
    {
        let output = Command::new("cmd")
            .args(["/C", "where nanobot"])
            .output()
            .map_err(|e| format!("failed to resolve nanobot on PATH: {e}"))?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() {
                return Ok(PathBuf::from(path));
            }
        }
    }

    Err(
        "nanobot executable not found. Install nanobot (e.g. `uv tool install nanobot-ai`) \
         and ensure it is on your login-shell PATH, or set NANOBOT_BIN to the absolute path."
            .into(),
    )
}

fn candidate_nanobot_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(home) = dirs::home_dir() {
        out.push(home.join(".local/bin/nanobot"));
        out.push(home.join(".cargo/bin/nanobot"));
        out.push(home.join(
            ".local/share/uv/tools/nanobot-ai/bin/nanobot",
        ));
    }
    out.push(PathBuf::from("/opt/homebrew/bin/nanobot"));
    out.push(PathBuf::from("/usr/local/bin/nanobot"));
    out
}

fn shell_which(shell: &str, args: &[&str]) -> Option<PathBuf> {
    let output = Command::new(shell).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }
    let path = PathBuf::from(path);
    path.is_file().then_some(path)
}

fn build_gateway_command(
    nanobot_bin: &Path,
    launcher: &Path,
    websocket_port: u16,
    health_port: u16,
) -> Result<Command, String> {
    let python = resolve_python_for_nanobot(nanobot_bin)?;
    let mut cmd = Command::new(python);
    cmd.arg(launcher);
    cmd.env("NANOBOT_DESKTOP_WS_PORT", websocket_port.to_string());
    cmd.env("NANOBOT_DESKTOP_HEALTH_PORT", health_port.to_string());
    cmd.env("NANOBOT_WEBUI_RUNTIME_SURFACE", "native");
    Ok(cmd)
}

fn resolve_python_for_nanobot(nanobot_bin: &Path) -> Result<PathBuf, String> {
    if let Ok(override_path) = std::env::var("NANOBOT_PYTHON") {
        let path = PathBuf::from(override_path.trim());
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!("NANOBOT_PYTHON does not exist: {}", path.display()));
    }

    if let Ok(content) = std::fs::read_to_string(nanobot_bin) {
        if let Some(line) = content.lines().next() {
            if let Some(shebang) = line.strip_prefix("#!") {
                let path = PathBuf::from(shebang.trim());
                if path.is_file() {
                    return Ok(path);
                }
            }
        }
    }

    // Binary next to a venv python (…/bin/nanobot → …/bin/python).
    if let Some(dir) = nanobot_bin.parent() {
        for name in ["python3", "python"] {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    Err(
        "could not resolve Python for nanobot. Set NANOBOT_PYTHON to the interpreter \
         that has the nanobot package installed."
            .into(),
    )
}

fn launcher_script_path(resource_dir: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(dir) = resource_dir {
        let bundled = dir.join("engine_launcher.py");
        if bundled.is_file() {
            return Ok(bundled);
        }
        let nested = dir.join("resources").join("engine_launcher.py");
        if nested.is_file() {
            return Ok(nested);
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("engine_launcher.py");
    if dev.is_file() {
        return Ok(dev);
    }

    Err("engine_launcher.py not found in resources".into())
}

fn read_log_tail(path: &Path, max_bytes: u64) -> String {
    let Ok(meta) = std::fs::metadata(path) else {
        return String::from("(engine.log missing)");
    };
    let Ok(mut file) = File::open(path) else {
        return String::from("(unable to read engine.log)");
    };
    use std::io::{Read, Seek, SeekFrom};
    let len = meta.len();
    if len > max_bytes {
        let _ = file.seek(SeekFrom::Start(len - max_bytes));
    }
    let mut buf = String::new();
    let _ = file.read_to_string(&mut buf);
    buf
}

pub fn append_startup_banner(logs_dir: &Path) -> Result<(), String> {
    let path = logs_dir.join("engine.log");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open engine log: {e}"))?;
    writeln!(file, "\n===== nanobot-desktop engine start {} =====", chrono_now())
        .map_err(|e| format!("write engine log: {e}"))
}

fn chrono_now() -> String {
    // Avoid pulling chrono just for a banner timestamp.
    format!("{:?}", std::time::SystemTime::now())
}
