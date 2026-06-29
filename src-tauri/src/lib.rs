use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;
use futures_util::StreamExt;
use serde::Serialize;

struct AppState {
    initial_file: Mutex<Option<String>>,
}

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

fn settings_path() -> PathBuf {
    let mut p = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push("Remark");
    let _ = fs::create_dir_all(&p);
    p.push("settings.json");
    p
}

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
    fs::read_to_string(&path).map_err(|e| format!("{}", e))
}

#[tauri::command]
fn save_settings(content: String) -> Result<(), String> {
    let path = settings_path();
    fs::write(&path, &content).map_err(|e| format!("{}", e))
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Read error: {}", e))
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Write error: {}", e))
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Read directory error: {}", e))?;
    let mut items: Vec<FileEntry> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            if let Some(name) = e.file_name().to_str() {
                !name.starts_with('.')
            } else {
                false
            }
        })
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let full = e.path().to_string_lossy().to_string();
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            FileEntry { name, path: full, is_dir }
        })
        .collect();
    items.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(items)
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Create dir error: {}", e))
}

#[tauri::command]
fn save_image(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, &data).map_err(|e| format!("Save image error: {}", e))
}

#[tauri::command]
async fn check_ollama(endpoint: String) -> Result<bool, String> {
    let url = format!("{}/api/tags", endpoint.trim_end_matches('/'));
    match reqwest::get(&url).await {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn format_with_ollama(
    endpoint: String,
    model: String,
    text: String,
) -> Result<String, String> {
    let url = format!("{}/api/generate", endpoint.trim_end_matches('/'));
    let prompt = format!(
        "Reformat the TEXT below as clean Markdown. Preserve all original words exactly—never add, remove, or paraphrase.\n\nTEXT:\n{}\n\nReformat the TEXT above. Output a JSON object with key \"formatted_markdown\".",
        text
    );
    let body = serde_json::json!({
        "model": model,
        "system": "Example: input: \"Step 1 install node\"  output: {{\"formatted_markdown\": \"## Step 1\\n\\nInstall node\"}}",
        "prompt": prompt,
        "stream": false,
        "format": "json",
        "options": { "temperature": 0.05 }
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama error: {}", e))?;
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Response parse error: {}", e))?;
    let raw = data["response"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "Empty response from Ollama".to_string())?;
    // Try to extract from JSON envelope (format:json forces JSON output)
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
        if let Some(s) = val.get("formatted_markdown").and_then(|v| v.as_str()) {
            return Ok(clean_ollama_output(s));
        }
    }
    Ok(clean_ollama_output(&raw))
}

/// Aggressively clean Ollama output: strip code fences and any preamble text.
fn clean_ollama_output(raw: &str) -> String {
    let trimmed = raw.trim();

    // 1. Recursively extract from ``` blocks
    if let Some(start) = trimmed.rfind("```") {
        let before = &trimmed[..start];
        if let Some(end) = before.rfind("```") {
            let inner = before[end + 3..].trim();
            if !inner.is_empty() {
                return clean_ollama_output(inner);
            }
        }
    }

    // 2. Strip any preamble lines before actual markdown content.
    //    A line is "markdown content" if it starts with a heading, list,
    //    blockquote, code fence, table, number, is >100 chars, or contains a URL.
    let lines: Vec<&str> = trimmed.lines().collect();
    let mut start = 0;
    for (i, line) in lines.iter().enumerate() {
        let l = line.trim();
        if l.is_empty() { continue; }
        if looks_like_markdown(l) { start = i; break; }
    }
    let result = lines[start..].join("\n").trim().to_string();
    if !result.is_empty() { return result; }

    trimmed.to_string()
}

fn looks_like_markdown(line: &str) -> bool {
    line.starts_with('#')
        || line.starts_with("- ")
        || line.starts_with("* ")
        || line.starts_with("+ ")
        || line.starts_with("> ")
        || line.starts_with("|")
        || line.starts_with("```")
        || line.starts_with('`')
        || line.len() > 100
        || line.contains("://")
        || line.chars().next().map_or(false, |c| c.is_ascii_digit())
}

#[tauri::command]
async fn download_ollama(app: tauri::AppHandle) -> Result<String, String> {
    let url = "https://ollama.com/download/OllamaSetup.exe";
    let dest = std::env::temp_dir().join("OllamaSetup.exe");

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download error: {}", e))?;

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(&dest)
        .map_err(|e| format!("File error: {}", e))?;

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        use std::io::Write;
        file.write_all(&chunk).map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "ollama-download-progress",
            serde_json::json!({
                "downloaded": downloaded,
                "total": total,
            }),
        );
    }

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
async fn install_ollama(path: String) -> Result<(), String> {
    let status = std::process::Command::new(&path)
        .arg("/S")
        .status()
        .map_err(|e| format!("Install error: {}. Try running as Administrator.", e))?;

    if let Some(code) = status.code() {
        if code != 0 {
            return Err(format!("Ollama installer exited with code {}. Try running as Administrator or install manually from https://ollama.com/download", code));
        }
    }
    Ok(())
}

#[tauri::command]
async fn pull_ollama_model(model: String) -> Result<(), String> {
    let status = std::process::Command::new("ollama")
        .args(["pull", &model])
        .status()
        .map_err(|e| format!("Model pull error: {}", e))?;

    if !status.success() {
        return Err("Model pull failed".to_string());
    }
    Ok(())
}

#[tauri::command]
fn register_file_assoc() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| format!("{}", e))?;
    let exe_path = exe.to_string_lossy().to_string();

    use std::process::Command;

    // Register app command path
    Command::new("reg")
        .args(&["add", "HKCU\\Software\\Classes\\Remark.md\\shell\\open\\command", "/ve", "/d", &exe_path, "/f"])
        .status()
        .map_err(|e| format!("{}", e))?;

    // Set friendly name
    Command::new("reg")
        .args(&["add", "HKCU\\Software\\Classes\\Remark.md", "/ve", "/d", "Markdown-Datei (Remark)", "/f"])
        .status()
        .map_err(|e| format!("{}", e))?;

    // Associate .md extension
    Command::new("reg")
        .args(&["add", "HKCU\\Software\\Classes\\.md", "/ve", "/d", "Remark.md", "/f"])
        .status()
        .map_err(|e| format!("{}", e))?;

    // Also .markdown
    Command::new("reg")
        .args(&["add", "HKCU\\Software\\Classes\\.markdown", "/ve", "/d", "Remark.md", "/f"])
        .status()
        .map_err(|e| format!("{}", e))?;

    Ok(exe_path)
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
async fn check_update(current_version: String) -> Result<Option<String>, String> {
    let url = "https://api.github.com/repos/leg1tfx/Remark/releases/latest";
    let client = reqwest::Client::builder()
        .user_agent("Remark")
        .build()
        .map_err(|e| format!("{}", e))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("{}", e))?;
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("{}", e))?;
    let latest = data["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
    if latest.is_empty() {
        return Ok(None);
    }
    // Simple semver compare: if latest != current, there's an update
    if latest != current_version {
        Ok(Some(latest.to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn get_ollama_models(endpoint: String) -> Result<Vec<String>, String> {
    let url = format!("{}/api/tags", endpoint.trim_end_matches('/'));
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Ollama fetch error: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Ollama parse error: {}", e))?;

    let models = data["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(initial_file: Option<String>) {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            initial_file: Mutex::new(initial_file),
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            list_directory,
            create_dir,
            save_image,
            file_exists,
            check_update,
            get_initial_file,
            register_file_assoc,
            read_settings,
            save_settings,
            check_ollama,
            format_with_ollama,
            download_ollama,
            install_ollama,
            pull_ollama_model,
            get_ollama_models,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to launch app");
}
