pub mod mft;
use tauri::Manager;

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
    use chrono::{DateTime, Local};
    use std::fs;
    use std::time::SystemTime;

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
fn open_file(path: String) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW};

    let safe_path = validate_path(&path)?;
    let mut wide_path: Vec<u16> = safe_path.as_os_str().encode_wide().collect();
    wide_path.push(0);
    let mut verb: Vec<u16> = "open".encode_utf16().collect();
    verb.push(0);

    unsafe {
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: Default::default(),
            hwnd: Default::default(),
            lpVerb: PCWSTR(verb.as_ptr()),
            lpFile: PCWSTR(wide_path.as_ptr()),
            lpParameters: PCWSTR::null(),
            lpDirectory: PCWSTR::null(),
            nShow: 1,
            hInstApp: Default::default(),
            lpIDList: std::ptr::null_mut(),
            lpClass: PCWSTR::null(),
            hkeyClass: Default::default(),
            dwHotKey: 0,
            Anonymous: Default::default(),
            hProcess: Default::default(),
        };

        ShellExecuteExW(&mut info).map_err(|e| format!("Failed to open file: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let safe_path = validate_path(&path)?;
    if safe_path.is_dir() {
        std::process::Command::new("explorer")
            .arg(&safe_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", safe_path.to_string_lossy()))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    open_folder(path)
}

#[tauri::command]
fn show_file_properties(path: String) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_INVOKEIDLIST};

    let safe_path = validate_path(&path)?;
    let mut wide_path: Vec<u16> = safe_path.as_os_str().encode_wide().collect();
    wide_path.push(0);
    let mut verb: Vec<u16> = "properties".encode_utf16().collect();
    verb.push(0);

    unsafe {
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_INVOKEIDLIST,
            hwnd: Default::default(),
            lpVerb: PCWSTR(verb.as_ptr()),
            lpFile: PCWSTR(wide_path.as_ptr()),
            lpParameters: PCWSTR::null(),
            lpDirectory: PCWSTR::null(),
            nShow: 5, // SW_SHOW
            hInstApp: Default::default(),
            lpIDList: std::ptr::null_mut(),
            lpClass: PCWSTR::null(),
            hkeyClass: Default::default(),
            dwHotKey: 0,
            Anonymous: Default::default(),
            hProcess: Default::default(),
        };

        ShellExecuteExW(&mut info).map_err(|e| format!("Failed to show properties: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn search_files(query: &str) -> Vec<mft::FileRecord> {
    if query.is_empty() {
        return Vec::new();
    }
    mft::search(query)
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

#[tauri::command]
fn save_recent_files(app: tauri::AppHandle, files: Vec<mft::FileRecord>) -> Result<(), String> {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir());
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("recent_files.json");
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    serde_json::to_writer(file, &files).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_recent_files(app: tauri::AppHandle) -> Result<Vec<mft::FileRecord>, String> {
    let path = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir()).join("recent_files.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let files: Vec<mft::FileRecord> = serde_json::from_reader(file).map_err(|e| e.to_string())?;
    Ok(files)
}

#[tauri::command]
fn get_available_drives() -> Vec<String> {
    let state = mft::GLOBAL_INDEX.read();
    if !state.indexed_drives.is_empty() {
        return state.indexed_drives.clone();
    }
    let mut set = std::collections::BTreeSet::new();
    for r in &state.records {
        if r.path.len() >= 2 && r.path.chars().nth(1) == Some(':') {
            set.insert(r.path[0..2].to_uppercase());
        }
    }
    set.into_iter().collect()
}

#[derive(serde::Serialize, Clone)]
pub struct DownloadProgress {
    pub percent: u32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[tauri::command]
async fn download_and_install_update(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri::Emitter;

    if !url.starts_with("https://") {
        return Err("Invalid download URL: must be HTTPS".to_string());
    }

    let temp_dir = std::env::temp_dir();
    let file_name = if url.ends_with(".msi") {
        "coolSearch_update.msi"
    } else {
        "coolSearch_update_setup.exe"
    };
    let target_path = temp_dir.join(file_name);

    if target_path.exists() {
        let _ = std::fs::remove_file(&target_path);
    }

    // Determine Content-Length via curl head request
    let mut total_bytes: u64 = 0;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut head_cmd = std::process::Command::new("curl.exe");
    head_cmd.args(&["-sIL", &url]);
    #[cfg(windows)]
    head_cmd.creation_flags(0x08000000);

    if let Ok(head_output) = head_cmd.output() {
        let head_str = String::from_utf8_lossy(&head_output.stdout);
        for line in head_str.lines() {
            let line_lower = line.to_lowercase();
            if line_lower.starts_with("content-length:") {
                if let Some(val_str) = line.split(':').nth(1) {
                    if let Ok(val) = val_str.trim().parse::<u64>() {
                        total_bytes = val;
                    }
                }
            }
        }
    }

    let target_str = target_path.to_string_lossy().to_string();
    let mut download_cmd = std::process::Command::new("curl.exe");
    download_cmd.args(&["-L", "-f", "-s", "-o", &target_str, &url]);
    #[cfg(windows)]
    download_cmd.creation_flags(0x08000000);

    let mut child = download_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn curl: {}", e))?;

    while let Ok(None) = child.try_wait() {
        if let Ok(meta) = std::fs::metadata(&target_path) {
            let downloaded = meta.len();
            let percent = if total_bytes > 0 {
                ((downloaded as f64 / total_bytes as f64) * 100.0).min(99.0) as u32
            } else {
                0
            };
            let _ = app.emit(
                "update-download-progress",
                DownloadProgress {
                    percent,
                    downloaded_bytes: downloaded,
                    total_bytes,
                },
            );
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }

    let exit_status = child.wait().map_err(|e| e.to_string())?;
    if !exit_status.success() {
        return Err("Download failed. Please check internet connection.".to_string());
    }

    let final_size = std::fs::metadata(&target_path).map(|m| m.len()).unwrap_or(total_bytes);
    let _ = app.emit(
        "update-download-progress",
        DownloadProgress {
            percent: 100,
            downloaded_bytes: final_size,
            total_bytes: final_size,
        },
    );

    // Launch downloaded installer
    open_file(target_str)?;

    // Gracefully exit application after 800ms
    let app_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(800));
        app_clone.exit(0);
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
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
        .plugin(tauri_plugin_updater::Builder::new().build()) // Requires pubkey in tauri.conf.json
        .invoke_handler(tauri::generate_handler![
            get_index_status,
            get_available_drives,
            search_files,
            get_file_details,
            open_file,
            open_folder,
            open_in_explorer,
            show_file_properties,
            open_url,
            refresh_index,
            save_recent_files,
            load_recent_files,
            download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
