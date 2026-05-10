pub mod mft;

#[tauri::command]
fn get_index_status() -> String {
    let state = mft::GLOBAL_INDEX.read();
    if state.is_indexing {
        "Indexing...".to_string()
    } else {
        state.stats.clone()
    }
}

#[derive(serde::Serialize)]
pub struct FileDetails {
    pub size: u64,
    pub created: String,
}

fn validate_path(path: &str) -> Result<std::path::PathBuf, String> {
    let p = std::path::PathBuf::from(path);
    if !p.is_absolute() {
        return Err("Invalid path: must be absolute".to_string());
    }
    if path.contains("..") {
        return Err("Invalid path: traversal detected".to_string());
    }
    Ok(p)
}

#[tauri::command]
fn get_file_details(path: String) -> Result<FileDetails, String> {
    use std::fs;
    use std::time::SystemTime;
    use chrono::{DateTime, Local};

    let safe_path = validate_path(&path)?;
    let metadata = fs::metadata(&safe_path).map_err(|e| e.to_string())?;
    let created: SystemTime = metadata.created().unwrap_or(SystemTime::now());
    let datetime: DateTime<Local> = created.into();
    
    Ok(FileDetails {
        size: metadata.len(),
        created: datetime.format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    use std::process::Command;
    let safe_path = validate_path(&path)?;
    Command::new("explorer")
        .arg("/select,")
        .arg(safe_path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn search_files(query: &str) -> Vec<mft::FileRecord> {
    if query.is_empty() {
        return Vec::new();
    }
    mft::search(query, 1000)
}

#[tauri::command]
fn refresh_index(app: tauri::AppHandle) {
    let cache_path = mft::get_cache_path(&app);
    mft::start_indexing(Some(cache_path));
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("http") {
        return Err("Invalid URL".to_string());
    }
    use std::process::Command;
    Command::new("cmd")
        .args(&["/C", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            let app_handle = app.handle().clone();
            
            // Try to load from cache first
            if !mft::load_cache(&app_handle) {
                // If no cache, start indexing
                let cache_path = mft::get_cache_path(&app_handle);
                mft::start_indexing(Some(cache_path));
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        // .plugin(tauri_plugin_updater::Builder::new().build()) // Requires pubkey in tauri.conf.json
        .invoke_handler(tauri::generate_handler![
            get_index_status, 
            search_files, 
            get_file_details, 
            open_in_explorer,
            open_url,
            refresh_index
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
