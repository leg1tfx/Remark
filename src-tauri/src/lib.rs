use std::ffi::OsString;
use std::fs;
use std::future::Future;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{Emitter, Manager};

mod ollama_text;

/// Returned when a running Ollama request was cancelled from the UI.
const CANCELLED: &str = "Cancelled";

/// Poll interval for cancellable waits.
const TICK: Duration = Duration::from_millis(250);

const DOC_EXTS: &[&str] = &["md", "markdown", "txt"];
const WRITE_EXTS: &[&str] = &["md", "markdown", "txt", "html", "htm"];
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct AppState {
    initial_file: Mutex<Option<String>>,
    http: reqwest::Client,
    /// Bumped for every Ollama generate request and by `cancel_ollama`;
    /// a running request aborts as soon as the value no longer matches its own.
    ollama_generation: AtomicU64,
}

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

// === Helpers ===

fn has_ext(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| allowed.iter().any(|a| a.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

fn require_ext(path: &Path, allowed: &[&str]) -> Result<(), String> {
    if has_ext(path, allowed) {
        Ok(())
    } else {
        Err(format!(
            "Unsupported file type: {} (allowed: {})",
            path.display(),
            allowed.join(", ")
        ))
    }
}

/// Write via a temp file + rename so a crash mid-write never leaves a truncated file.
/// Falls back to a direct write for symlinks or when the rename is refused
/// (e.g. the target is locked by another program on Windows).
fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let is_symlink = fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);
    let Some(name) = path.file_name().filter(|_| !is_symlink) else {
        return fs::write(path, data);
    };
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut tmp_name = OsString::from(".");
    tmp_name.push(name);
    tmp_name.push(".remark-tmp");
    let tmp = dir.join(tmp_name);

    let written = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()
    })();
    if written.is_ok() && fs::rename(&tmp, path).is_ok() {
        return Ok(());
    }
    let _ = fs::remove_file(&tmp);
    fs::write(path, data)
}

/// Let the webview load images next to a document the user opened (asset protocol).
fn allow_document_dir(app: &tauri::AppHandle, doc: &Path) {
    if let Some(dir) = doc.parent().filter(|p| !p.as_os_str().is_empty()) {
        // The scope compares against canonicalized request paths, so canonicalize here too.
        let dir = fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
        let _ = app.asset_protocol_scope().allow_directory(dir, true);
    }
}

fn settings_path() -> PathBuf {
    let mut p = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push("Remark");
    let _ = fs::create_dir_all(&p);
    p.push("settings.json");
    p
}

fn ollama_url(endpoint: &str, path: &str) -> String {
    format!("{}{}", endpoint.trim().trim_end_matches('/'), path)
}

/// Await `fut`, giving up after `limit` or as soon as `cancel` signals cancellation.
async fn wait_for<T>(
    fut: impl Future<Output = T>,
    limit: Duration,
    cancel: Option<(&AtomicU64, u64)>,
) -> Result<T, String> {
    tokio::pin!(fut);
    let mut waited = Duration::ZERO;
    loop {
        match tokio::time::timeout(TICK, &mut fut).await {
            Ok(v) => return Ok(v),
            Err(_) => {
                if let Some((current, mine)) = cancel {
                    if current.load(Ordering::SeqCst) != mine {
                        return Err(CANCELLED.to_string());
                    }
                }
                waited += TICK;
                if waited >= limit {
                    return Err("Timed out waiting for a response".to_string());
                }
            }
        }
    }
}

/// Split a streamed body into newline-delimited JSON objects.
struct NdjsonBuffer(Vec<u8>);

impl NdjsonBuffer {
    fn push(&mut self, chunk: &[u8]) -> Vec<serde_json::Value> {
        self.0.extend_from_slice(chunk);
        let mut out = Vec::new();
        while let Some(pos) = self.0.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = self.0.drain(..=pos).collect();
            if let Ok(v) = serde_json::from_slice(&line) {
                out.push(v);
            }
        }
        out
    }

    fn finish(&mut self) -> Option<serde_json::Value> {
        let rest = std::mem::take(&mut self.0);
        serde_json::from_slice(&rest).ok()
    }
}

// === Files & settings ===

#[tauri::command]
fn get_initial_file(state: tauri::State<AppState>) -> Option<String> {
    state.initial_file.lock().unwrap().take()
}

#[tauri::command]
fn read_settings() -> Result<String, String> {
    let path = settings_path();
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(content: String) -> Result<(), String> {
    write_atomic(&settings_path(), content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let p = Path::new(&path);
    require_ext(p, DOC_EXTS)?;
    let content = fs::read_to_string(p).map_err(|e| format!("Read error: {}", e))?;
    allow_document_dir(&app, p);
    Ok(content)
}

#[tauri::command]
fn write_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    require_ext(p, WRITE_EXTS)?;
    write_atomic(p, content.as_bytes()).map_err(|e| format!("Write error: {}", e))?;
    if has_ext(p, DOC_EXTS) {
        allow_document_dir(&app, p);
    }
    Ok(())
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Read directory error: {}", e))?;
    let mut items: Vec<FileEntry> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_str()
                .map(|name| !name.starts_with('.'))
                .unwrap_or(false)
        })
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let full = e.path().to_string_lossy().to_string();
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            FileEntry {
                name,
                path: full,
                is_dir,
            }
        })
        .collect();
    items.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(items)
}

/// Save a pasted image; creates the parent directory if needed.
#[tauri::command]
fn save_image(path: String, data: Vec<u8>) -> Result<(), String> {
    let p = Path::new(&path);
    require_ext(p, IMAGE_EXTS)?;
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Create dir error: {}", e))?;
    }
    write_atomic(p, &data).map_err(|e| format!("Save image error: {}", e))
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
async fn check_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, String> {
    let url = "https://api.github.com/repos/leg1tfx/Remark/releases/latest";
    let resp = state
        .http
        .get(url)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let tag = data["tag_name"].as_str().unwrap_or("");
    let Ok(latest) = semver::Version::parse(tag.trim().trim_start_matches('v')) else {
        return Ok(None);
    };
    let current = &app.package_info().version;
    Ok((&latest > current).then(|| latest.to_string()))
}

// === Ollama: text generation ===

#[derive(Clone, Serialize)]
struct GenerateProgress {
    chars: usize,
}

/// Stream a generate request constrained to `schema`, emitting progress, and return the raw output.
async fn ollama_generate(
    app: &tauri::AppHandle,
    state: &AppState,
    endpoint: &str,
    model: &str,
    system: &str,
    prompt: String,
    schema: serde_json::Value,
) -> Result<String, String> {
    let generation = state.ollama_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let cancel = Some((&state.ollama_generation, generation));
    let url = ollama_url(endpoint, "/api/generate");

    let send = |format: serde_json::Value| {
        let body = serde_json::json!({
            "model": model,
            "system": system,
            "prompt": prompt,
            "stream": true,
            "format": format,
            "options": { "temperature": 0.05 }
        });
        state.http.post(&url).json(&body).send()
    };

    // Loading a model can take a while on first use.
    let load_limit = Duration::from_secs(300);
    let mut resp = wait_for(send(schema), load_limit, cancel)
        .await?
        .map_err(|e| format!("Ollama error: {}", e))?;
    if resp.status() == reqwest::StatusCode::BAD_REQUEST {
        // Ollama < 0.5 does not understand JSON-schema formats.
        resp = wait_for(send(serde_json::json!("json")), load_limit, cancel)
            .await?
            .map_err(|e| format!("Ollama error: {}", e))?;
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama returned {}: {}", status, text.trim()));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = NdjsonBuffer(Vec::new());
    let mut out = String::new();
    let handle = |v: serde_json::Value, out: &mut String| -> Result<(), String> {
        if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
            return Err(format!("Ollama error: {}", err));
        }
        if let Some(s) = v.get("response").and_then(|r| r.as_str()) {
            out.push_str(s);
        }
        Ok(())
    };

    while let Some(chunk) = wait_for(stream.next(), Duration::from_secs(120), cancel).await? {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        for v in buf.push(&chunk) {
            handle(v, &mut out)?;
        }
        let _ = app.emit(
            "ollama-progress",
            GenerateProgress {
                chars: out.chars().count(),
            },
        );
    }
    if let Some(v) = buf.finish() {
        handle(v, &mut out)?;
    }

    if out.trim().is_empty() {
        return Err("Empty response from Ollama".to_string());
    }
    Ok(out)
}

/// Longest document excerpt sent along as context for line classification.
const CLASSIFY_CONTEXT_CHARS: usize = 6000;

/// Decide the Markdown block type of each line. The model only picks labels from a fixed
/// set (enforced by a JSON schema); the frontend applies the syntax, so the user's words
/// can never be changed.
#[tauri::command]
async fn classify_lines(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    endpoint: String,
    model: String,
    context: String,
    lines: Vec<String>,
) -> Result<Vec<String>, String> {
    let n = lines.len();
    if n == 0 {
        return Ok(Vec::new());
    }
    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "labels": {
                "type": "array",
                "items": { "type": "string", "enum": ollama_text::LABELS },
                "minItems": n,
                "maxItems": n,
            }
        },
        "required": ["labels"],
    });
    let context: String = context.chars().take(CLASSIFY_CONTEXT_CHARS).collect();
    let numbered = lines
        .iter()
        .enumerate()
        .map(|(i, l)| format!("{}. {}", i + 1, l.trim()))
        .collect::<Vec<_>>()
        .join("\n");
    let prompt = format!(
        "Document (for context):\n\"\"\"\n{}\n\"\"\"\n\nClassify each of these {} lines from the document. \
         Answer with a JSON object {{\"labels\": [...]}} containing exactly {} labels, one per line, in the same order.\n\n{}",
        context, n, n, numbered
    );
    let raw = ollama_generate(
        &app,
        &state,
        &endpoint,
        &model,
        "You decide the Markdown structure of plain text lines. Labels: \
         heading1 = title of the whole document, heading2 = section heading, heading3 = sub-section heading, \
         bullet = item in an unordered list, numbered = step or item in an ordered sequence, \
         quote = quoted text, paragraph = normal sentence or text. \
         Short title-like lines without final punctuation are usually headings. \
         Several short parallel lines in a row are usually list items. When unsure, answer paragraph.",
        prompt,
        schema,
    )
    .await?;
    ollama_text::parse_labels(&raw, n)
}

#[tauri::command]
async fn correct_with_ollama(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    endpoint: String,
    model: String,
    text: String,
) -> Result<String, String> {
    let prompt = format!(
        "Correct spelling and grammar:\n\n{}\n\nOutput only a JSON object with key \"corrected\".",
        text
    );
    let schema = serde_json::json!({
        "type": "object",
        "properties": { "corrected": { "type": "string" } },
        "required": ["corrected"],
    });
    let raw = ollama_generate(
        &app,
        &state,
        &endpoint,
        &model,
        "Fix spelling and grammar errors. Preserve every word that is correct. Do not rephrase or rewrite creatively.",
        prompt,
        schema,
    )
    .await?;
    let result = ollama_text::extract_field(&raw, "corrected");
    if result.trim().is_empty() {
        return Err("Empty response from Ollama".to_string());
    }
    Ok(result)
}

/// Abort the running classify/correct request (the HTTP stream is dropped, so Ollama stops too).
#[tauri::command]
fn cancel_ollama(state: tauri::State<AppState>) {
    state.ollama_generation.fetch_add(1, Ordering::SeqCst);
}

#[tauri::command]
async fn check_ollama(state: tauri::State<'_, AppState>, endpoint: String) -> Result<bool, String> {
    let url = ollama_url(&endpoint, "/api/tags");
    match state
        .http
        .get(&url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn get_ollama_models(
    state: tauri::State<'_, AppState>,
    endpoint: String,
) -> Result<Vec<String>, String> {
    let url = ollama_url(&endpoint, "/api/tags");
    let resp = state
        .http
        .get(&url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Ollama fetch error: {}", e))?;
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Ollama parse error: {}", e))?;
    Ok(data["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default())
}

// === Ollama: setup ===

fn ollama_installer_path() -> PathBuf {
    std::env::temp_dir().join("Remark").join("OllamaSetup.exe")
}

#[tauri::command]
async fn download_ollama(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let url = "https://ollama.com/download/OllamaSetup.exe";
    let dest = ollama_installer_path();
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("File error: {}", e))?;
    }
    let part = dest.with_extension("part");

    let resp = wait_for(state.http.get(url).send(), Duration::from_secs(30), None)
        .await?
        .map_err(|e| format!("Download error: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Download failed: HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = fs::File::create(&part).map_err(|e| format!("File error: {}", e))?;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = wait_for(stream.next(), Duration::from_secs(60), None).await? {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "ollama-download-progress",
            serde_json::json!({ "downloaded": downloaded, "total": total }),
        );
    }
    file.sync_all().map_err(|e| format!("Write error: {}", e))?;
    drop(file);
    if total > 0 && downloaded != total {
        let _ = fs::remove_file(&part);
        return Err("Download incomplete, please try again".to_string());
    }
    fs::rename(&part, &dest).map_err(|e| format!("File error: {}", e))?;
    Ok(())
}

/// Refuse to run the installer unless Windows reports a valid Authenticode signature.
#[cfg(windows)]
async fn verify_signature(path: &Path) -> Result<(), String> {
    let script = format!(
        "(Get-AuthenticodeSignature -LiteralPath '{}').Status",
        path.display().to_string().replace('\'', "''")
    );
    let out = tokio::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .await
        .map_err(|e| format!("Signature check failed: {}", e))?;
    let status = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if status == "Valid" {
        Ok(())
    } else {
        Err(format!(
            "The downloaded installer has no valid signature ({}). Install Ollama manually from https://ollama.com/download",
            if status.is_empty() { "unknown" } else { &status }
        ))
    }
}

#[cfg(windows)]
#[tauri::command]
async fn install_ollama() -> Result<(), String> {
    let path = ollama_installer_path();
    if !path.exists() {
        return Err("Installer not found, please download again".to_string());
    }
    verify_signature(&path).await?;
    // OllamaSetup.exe is an Inno Setup installer.
    let status = tokio::process::Command::new(&path)
        .args(["/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART"])
        .status()
        .await
        .map_err(|e| format!("Install error: {}. Try running as Administrator.", e))?;
    let _ = fs::remove_file(&path);
    if !status.success() {
        return Err(format!(
            "Ollama installer exited with {}. Try running as Administrator or install manually from https://ollama.com/download",
            status
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
async fn install_ollama() -> Result<(), String> {
    Err("Automatic installation is only available on Windows. Install Ollama from https://ollama.com/download".to_string())
}

/// Start the Ollama app after a fresh install (the installer may not launch it in silent mode).
#[tauri::command]
fn start_ollama() -> Result<(), String> {
    #[cfg(windows)]
    {
        let base = dirs::data_local_dir()
            .ok_or("Local app data folder not found")?
            .join("Programs")
            .join("Ollama");
        for exe in ["ollama app.exe", "ollama.exe"] {
            let path = base.join(exe);
            if path.exists() {
                let mut cmd = std::process::Command::new(&path);
                if exe == "ollama.exe" {
                    cmd.arg("serve");
                }
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(CREATE_NO_WINDOW)
                    .spawn()
                    .map_err(|e| format!("Could not start Ollama: {}", e))?;
                return Ok(());
            }
        }
        Err("Ollama installation not found".to_string())
    }
    #[cfg(not(windows))]
    {
        Err("Start Ollama manually".to_string())
    }
}

fn valid_model_name(model: &str) -> bool {
    !model.is_empty()
        && model.len() <= 200
        && !model.starts_with('-')
        && model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._:/-".contains(c))
}

/// Pull a model through the HTTP API (works even when `ollama` is not on PATH yet).
#[tauri::command]
async fn pull_ollama_model(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    endpoint: String,
    model: String,
) -> Result<(), String> {
    if !valid_model_name(&model) {
        return Err(format!("Invalid model name: {}", model));
    }
    let url = ollama_url(&endpoint, "/api/pull");
    let body = serde_json::json!({ "model": model, "stream": true });
    let resp = wait_for(
        state.http.post(&url).json(&body).send(),
        Duration::from_secs(60),
        None,
    )
    .await?
    .map_err(|e| format!("Model pull error: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Model pull failed: HTTP {}", resp.status()));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = NdjsonBuffer(Vec::new());
    let mut last_status = String::new();
    let mut handle = |v: serde_json::Value| -> Result<(), String> {
        if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
            return Err(format!("Model pull failed: {}", err));
        }
        if let Some(s) = v.get("status").and_then(|s| s.as_str()) {
            last_status = s.to_string();
        }
        let _ = app.emit(
            "ollama-pull-progress",
            serde_json::json!({
                "status": v.get("status"),
                "completed": v.get("completed"),
                "total": v.get("total"),
            }),
        );
        Ok(())
    };
    while let Some(chunk) = wait_for(stream.next(), Duration::from_secs(120), None).await? {
        let chunk = chunk.map_err(|e| format!("Model pull error: {}", e))?;
        for v in buf.push(&chunk) {
            handle(v)?;
        }
    }
    if let Some(v) = buf.finish() {
        handle(v)?;
    }
    if last_status != "success" {
        return Err("Model pull did not complete".to_string());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(initial_file: Option<String>) {
    let http = reqwest::Client::builder()
        .user_agent(concat!("Remark/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .expect("Failed to build HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            initial_file: Mutex::new(initial_file),
            http,
            ollama_generation: AtomicU64::new(0),
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            list_directory,
            save_image,
            file_exists,
            check_update,
            get_initial_file,
            read_settings,
            save_settings,
            check_ollama,
            classify_lines,
            correct_with_ollama,
            cancel_ollama,
            download_ollama,
            install_ollama,
            start_ollama,
            pull_ollama_model,
            get_ollama_models,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to launch app");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_checks_are_case_insensitive() {
        assert!(has_ext(Path::new("C:/docs/Readme.MD"), DOC_EXTS));
        assert!(has_ext(Path::new("notes.markdown"), DOC_EXTS));
        assert!(!has_ext(Path::new("evil.exe"), DOC_EXTS));
        assert!(!has_ext(Path::new("noext"), DOC_EXTS));
        assert!(require_ext(Path::new("a.png"), IMAGE_EXTS).is_ok());
        assert!(require_ext(Path::new("a.svg"), IMAGE_EXTS).is_err());
    }

    #[test]
    fn model_names_are_validated() {
        assert!(valid_model_name("llama3.2:3b"));
        assert!(valid_model_name("hf.co/org/model:Q4_K_M"));
        assert!(!valid_model_name("--help"));
        assert!(!valid_model_name(""));
        assert!(!valid_model_name("a b"));
    }

    #[test]
    fn ndjson_buffer_handles_split_lines() {
        let mut buf = NdjsonBuffer(Vec::new());
        assert!(buf.push(b"{\"response\":\"He").is_empty());
        let vals = buf.push(b"llo\"}\n{\"response\":\" world\"}\n{\"done\":");
        assert_eq!(vals.len(), 2);
        assert_eq!(vals[0]["response"], "Hello");
        assert!(buf.push(b"true}").is_empty());
        assert_eq!(buf.finish().unwrap()["done"], true);
    }

    #[test]
    fn atomic_write_replaces_content() {
        let dir = std::env::temp_dir().join(format!("remark-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("doc.md");
        write_atomic(&file, b"first").unwrap();
        write_atomic(&file, b"second").unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "second");
        assert!(!dir.join(".doc.md.remark-tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
