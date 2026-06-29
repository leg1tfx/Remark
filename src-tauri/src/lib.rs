use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;
use futures_util::StreamExt;

struct AppState {
    initial_file: Mutex<Option<String>>,
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
    fs::read_to_string(&path).map_err(|e| format!("Fehler beim Lesen: {}", e))
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Fehler beim Schreiben: {}", e))
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
        "Du bist ein Markdown-Formatter. Formatiere den folgenden Text als Markdown mit Überschriften, Listen und Absätzen. Gib NUR das formatierte Markdown zurück, keine Erklärung.\n\n{}",
        text
    );
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": { "temperature": 0.1 }
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Client-Fehler: {}", e))?;
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama-Fehler: {}", e))?;
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Fehler beim Lesen der Antwort: {}", e))?;
    data["response"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "Keine Antwort von Ollama erhalten".to_string())
}

#[tauri::command]
async fn download_ollama(app: tauri::AppHandle) -> Result<String, String> {
    let url = "https://ollama.com/download/OllamaSetup.exe";
    let dest = std::env::temp_dir().join("OllamaSetup.exe");

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Client-Fehler: {}", e))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download-Fehler: {}", e))?;

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(&dest)
        .map_err(|e| format!("Datei-Fehler: {}", e))?;

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream-Fehler: {}", e))?;
        use std::io::Write;
        file.write_all(&chunk).map_err(|e| format!("Schreibfehler: {}", e))?;
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
        .map_err(|e| format!("Installationsfehler: {}", e))?;

    if !status.success() {
        return Err("Installation fehlgeschlagen".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn pull_ollama_model(model: String) -> Result<(), String> {
    let status = std::process::Command::new("ollama")
        .args(["pull", &model])
        .status()
        .map_err(|e| format!("Fehler beim Model-Pull: {}", e))?;

    if !status.success() {
        return Err("Model-Pull fehlgeschlagen".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn get_ollama_models(endpoint: String) -> Result<Vec<String>, String> {
    let url = format!("{}/api/tags", endpoint.trim_end_matches('/'));
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Fehler: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Fehler beim Lesen: {}", e))?;

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
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            initial_file: Mutex::new(initial_file),
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            get_initial_file,
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
        .expect("Fehler beim Starten der App");
}
