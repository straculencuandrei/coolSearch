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

#[tauri::command]
fn search_files(query: &str) -> Vec<mft::FileRecord> {
    if query.is_empty() {
        return Vec::new();
    }
    mft::search(query, 1000)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            mft::start_indexing();
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_index_status, search_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
