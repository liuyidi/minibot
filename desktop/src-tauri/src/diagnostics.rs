use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::remote::{EngineStatus, HostRuntimeInfo};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct HostDiagnosticsSnapshot {
    pub generated_at_ms: i64,
    pub app_version: String,
    pub sections: Vec<DiagnosticSection>,
    pub issues: Vec<DiagnosticIssue>,
    pub report: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DiagnosticSection {
    pub id: String,
    pub title: String,
    pub rows: Vec<DiagnosticRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DiagnosticRow {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DiagnosticIssue {
    pub severity: String,
    pub message: String,
}

pub fn collect_snapshot(
    runtime: HostRuntimeInfo,
    last_error: Option<String>,
    log_tail: String,
) -> Result<HostDiagnosticsSnapshot, String> {

    let mut env_rows = base_environment_rows(&runtime);
    env_rows.extend(platform_environment_rows());

    let system_rows = platform_system_rows();
    let runtime_rows = runtime_section_rows(&runtime, last_error.as_deref(), &log_tail);
    let issues = detect_issues(&runtime, last_error.as_deref(), &system_rows);

    let sections = vec![
        section("environment", "Environment", env_rows),
        section("system", "System", system_rows),
        section("runtime", "Runtime", runtime_rows),
    ];

    let generated_at_ms = unix_ms_now();
    let report = format_report(
        generated_at_ms,
        &runtime.app_version,
        &sections,
        &issues,
    );

    Ok(HostDiagnosticsSnapshot {
        generated_at_ms,
        app_version: runtime.app_version.clone(),
        sections,
        issues,
        report,
    })
}


fn section(id: &str, title: &str, rows: Vec<DiagnosticRow>) -> DiagnosticSection {
    DiagnosticSection {
        id: id.to_string(),
        title: title.to_string(),
        rows,
    }
}

fn base_environment_rows(runtime: &HostRuntimeInfo) -> Vec<DiagnosticRow> {
    vec![
        row("App", format!("{} (native host)", runtime.app_version)),
        row("Architecture", std::env::consts::ARCH),
        row("Locale", locale_label()),
    ]
}

#[cfg(target_os = "macos")]
fn platform_environment_rows() -> Vec<DiagnosticRow> {
    let mut rows = Vec::new();
    if let Some(version) = command_output("sw_vers", &["-productVersion"]) {
        let name = command_output("sw_vers", &["-productName"]).unwrap_or_else(|| "macOS".into());
        rows.push(row("macOS", format!("{version} ({name})")));
    }
    if let Some(chip) = sysctl_string("machdep.cpu.brand_string") {
        rows.push(row("Chip", chip));
    }
    if let Some(model) = sysctl_string("hw.model") {
        rows.push(row("Model", model));
    }
    rows.push(row("Bundle", "me.liuyidi.minibot.desktop"));
    if let Some(display) = primary_display_summary() {
        rows.push(row("Display", display));
    }
    rows
}

#[cfg(not(target_os = "macos"))]
fn platform_environment_rows() -> Vec<DiagnosticRow> {
    let mut rows = Vec::new();
    if let Some(os) = command_output("uname", &["-sr"]) {
        rows.push(row("OS", os));
    }
    rows.push(row("Bundle", "me.liuyidi.minibot.desktop"));
    rows
}

#[cfg(target_os = "macos")]
fn platform_system_rows() -> Vec<DiagnosticRow> {
    let mut rows = Vec::new();
    if let Some(cpu) = macos_cpu_usage() {
        rows.push(row("CPU", cpu));
    }
    if let Some(load) = macos_load_average() {
        rows.push(row("Load avg", load));
    }
    if let Some((used, total, pct)) = macos_memory_usage() {
        rows.push(row("Memory", format!("{used} / {total} ({pct}%)")));
        rows.push(row(
            "Memory pressure",
            if pct >= 80 { "warn".to_string() } else { "ok".to_string() },
        ));
    }
    if let Some(disk) = macos_root_disk_usage() {
        rows.push(row("Disk /", disk));
    }
    if let Some(uptime) = command_output("uptime", &[]) {
        rows.push(row("Uptime", normalize_whitespace(&uptime)));
    }
    if let Some(top) = macos_top_processes() {
        rows.push(row("Top processes", top));
    }
    rows
}

#[cfg(not(target_os = "macos"))]
fn platform_system_rows() -> Vec<DiagnosticRow> {
    let mut rows = Vec::new();
    if let Some(load) = command_output("uptime", &[]) {
        rows.push(row("Uptime", normalize_whitespace(&load)));
    }
    rows
}

fn runtime_section_rows(
    runtime: &HostRuntimeInfo,
    last_error: Option<&str>,
    log_tail: &str,
) -> Vec<DiagnosticRow> {
    vec![
        row("Engine status", format!("{:?}", runtime.engine_status).to_lowercase()),
        row("API base", runtime.api_base.clone()),
        row("Sidecar", runtime.python.clone()),
        row("Data dir", runtime.data_dir.clone()),
        row("Logs dir", runtime.logs_dir.clone()),
        row("Config path", runtime.config_path.clone()),
        row("Workspace", runtime.workspace_path.clone()),
        row("Last error", last_error.unwrap_or("(none)")),
        row(
            "Connection log (tail)",
            if log_tail.trim().is_empty() {
                "(empty)".into()
            } else {
                log_tail.to_string()
            },
        ),
    ]
}

fn detect_issues(
    runtime: &HostRuntimeInfo,
    last_error: Option<&str>,
    system_rows: &[DiagnosticRow],
) -> Vec<DiagnosticIssue> {
    let mut issues = Vec::new();

    match runtime.engine_status {
        EngineStatus::Crashed => issues.push(issue(
            "error",
            "Engine crashed. Restart the engine or check logs for details.",
        )),
        EngineStatus::Stopped => issues.push(issue(
            "warn",
            "Engine is stopped. Reconnect or restart the native host.",
        )),
        EngineStatus::Starting | EngineStatus::Restarting => issues.push(issue(
            "info",
            "Engine is still starting. Some runtime details may change after it becomes ready.",
        )),
        EngineStatus::Ready => {}
    }

    if let Some(err) = last_error.filter(|value| !value.trim().is_empty()) {
        issues.push(issue("warn", format!("Last engine error: {err}")));
    }

    for row in system_rows {
        if row.key == "Memory pressure" && row.value == "warn" {
            issues.push(issue(
                "warn",
                "Memory pressure is high. Close unused apps if minibot feels slow.",
            ));
        }
        if row.key == "Disk /" {
            if let Some(pct) = row.value.rsplit('(').next().and_then(|part| {
                part.trim_end_matches("%)").trim().parse::<u32>().ok()
            }) {
                if pct >= 90 {
                    issues.push(issue(
                        "warn",
                        "Disk space is low on the system volume.",
                    ));
                }
            }
        }
    }

    issues
}

fn issue(severity: &str, message: impl Into<String>) -> DiagnosticIssue {
    DiagnosticIssue {
        severity: severity.to_string(),
        message: message.into(),
    }
}

fn row(key: impl Into<String>, value: impl Into<String>) -> DiagnosticRow {
    DiagnosticRow {
        key: key.into(),
        value: value.into(),
    }
}

fn locale_label() -> String {
    std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LANG"))
        .unwrap_or_else(|_| "unknown".into())
}

fn unix_ms_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn format_report(
    generated_at_ms: i64,
    app_version: &str,
    sections: &[DiagnosticSection],
    issues: &[DiagnosticIssue],
) -> String {
    let generated = format_timestamp_ms(generated_at_ms);
    let mut out = format!(
        "# minibot Desktop Report\nGenerated: {generated}\nApp: {app_version}\n"
    );

    for section in sections {
        out.push_str(&format!("\n## {}\n", section.title));
        for row in &section.rows {
            if row.key == "Connection log (tail)" {
                continue;
            }
            if row.key == "Top processes" {
                out.push_str("- Top processes:\n");
                for line in row.value.lines() {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    if let Some((name, pct)) = line.split_once('\t') {
                        out.push_str(&format!("  - {name}: {pct}\n"));
                    } else {
                        out.push_str(&format!("  - {line}\n"));
                    }
                }
                continue;
            }
            out.push_str(&format!("- {}: {}\n", row.key, row.value));
        }
    }

    if !issues.is_empty() {
        out.push_str("\n## Detected Issues\n");
        for issue in issues {
            out.push_str(&format!("- [{}] {}\n", issue.severity, issue.message));
        }
    }

    if let Some(runtime) = sections.iter().find(|section| section.id == "runtime") {
        if let Some(log_row) = runtime
            .rows
            .iter()
            .find(|row| row.key == "Connection log (tail)")
        {
            if !log_row.value.trim().is_empty() && log_row.value != "(empty)" {
                out.push_str("\n## Connection Log (tail)\n```\n");
                out.push_str(&log_row.value);
                if !log_row.value.ends_with('\n') {
                    out.push('\n');
                }
                out.push_str("```\n");
            }
        }
    }

    out
}

fn format_timestamp_ms(ms: i64) -> String {
    if ms <= 0 {
        return "unknown".into();
    }
    let seconds = ms / 1000;
    if let Ok(datetime) = chrono_like(seconds) {
        return datetime;
    }
    ms.to_string()
}

fn chrono_like(seconds: i64) -> Result<String, ()> {
    let output = Command::new("date")
        .args([
            "-r",
            &seconds.to_string(),
            "+%Y-%m-%d %H:%M:%S %Z",
        ])
        .output()
        .map_err(|_| ())?;
    if !output.status.success() {
        return Err(());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn command_output(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn sysctl_string(key: &str) -> Option<String> {
    command_output("sysctl", &["-n", key])
}

fn normalize_whitespace(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(target_os = "macos")]
fn macos_cpu_usage() -> Option<String> {
    let output = command_output(
        "bash",
        &[
            "-lc",
            "ps -A -o %cpu= | awk '{s+=$1} END { if (NR==0) exit 1; printf \"%.1f%%\", s }'",
        ],
    )?;
    Some(output)
}

#[cfg(target_os = "macos")]
fn macos_load_average() -> Option<String> {
    let load = sysctl_string("vm.loadavg")?;
    let cores = sysctl_string("hw.ncpu").unwrap_or_else(|| "?".into());
    let trimmed = load
        .trim_matches('{')
        .trim_matches('}')
        .split_whitespace()
        .take(3)
        .collect::<Vec<_>>()
        .join(", ");
    Some(format!("{trimmed} ({cores} cores)"))
}

#[cfg(target_os = "macos")]
fn macos_memory_usage() -> Option<(String, String, u32)> {
    let total_bytes = sysctl_string("hw.memsize")?.parse::<u64>().ok()?;
    let page_size = sysctl_string("hw.pagesize")?.parse::<u64>().ok()?;
    let vm_stat = command_output("vm_stat", &[])?;
    let mut free_pages = 0u64;
    let mut inactive_pages = 0u64;
    let mut speculative_pages = 0u64;
    for line in vm_stat.lines() {
        let Some((label, value)) = line.split_once(':') else {
            continue;
        };
        let pages = value.trim().trim_end_matches('.').parse::<u64>().ok()?;
        match label.trim() {
            "Pages free" => free_pages = pages,
            "Pages inactive" => inactive_pages = pages,
            "Pages speculative" => speculative_pages = pages,
            _ => {}
        }
    }
    let reclaimable = (free_pages + inactive_pages + speculative_pages) * page_size;
    let used = total_bytes.saturating_sub(reclaimable.min(total_bytes));
    let pct = ((used as f64 / total_bytes as f64) * 100.0).round() as u32;
    Some((
        format_bytes(used),
        format_bytes(total_bytes),
        pct,
    ))
}

#[cfg(target_os = "macos")]
fn macos_root_disk_usage() -> Option<String> {
    let output = command_output("df", &["-k", "/"])?;
    let line = output.lines().nth(1)?;
    let parts: Vec<_> = line.split_whitespace().collect();
    if parts.len() < 5 {
        return None;
    }
    let total_kb = parts[1].parse::<u64>().ok()?;
    let used_kb = parts[2].parse::<u64>().ok()?;
    let pct = parts[4].trim_end_matches('%').parse::<u32>().ok()?;
    Some(format!(
        "{} / {} ({}%)",
        format_bytes(used_kb * 1024),
        format_bytes(total_kb * 1024),
        pct
    ))
}

#[cfg(target_os = "macos")]
fn macos_top_processes() -> Option<String> {
    // One process per line: "Name\t42.9%" — UI renders name left / percent right.
    let raw = command_output(
        "bash",
        &[
            "-lc",
            "ps -Arco %cpu=,comm= | head -n 10 | awk 'NF>=2 {cpu=$1; $1=\"\"; sub(/^ +/, \"\"); printf \"%s\\t%.1f%%\\n\", $0, cpu}'",
        ],
    )?;
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

#[cfg(target_os = "macos")]
fn primary_display_summary() -> Option<String> {
    command_output(
        "bash",
        &[
            "-lc",
            "system_profiler SPDisplaysDataType 2>/dev/null | awk '/Resolution:/ {res=$2\"x\"$4; scale=$6; gsub(/[^0-9]/, \"\", scale); printf \"%s @ %sx\", res, (scale==\"\"?\"1\":scale); found=1; exit} END { if (!found) exit 1 }'",
        ],
    )
}

fn format_bytes(bytes: u64) -> String {
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    if bytes >= GB as u64 {
        format!("{:.2} GB", bytes as f64 / GB)
    } else {
        format!("{:.0} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}
