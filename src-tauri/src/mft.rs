#![allow(non_snake_case)]
#![allow(non_camel_case_types)]

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use std::collections::{HashMap, BTreeSet};
use std::ffi::{c_void, OsString};
use std::mem::size_of;
use std::os::windows::ffi::OsStringExt;

use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use tauri::Manager;
use windows::core::HSTRING;
use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW,
    FILE_ATTRIBUTE_DIRECTORY, FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_READ, FILE_SHARE_WRITE,
    OPEN_EXISTING,
};
use windows::Win32::System::Ioctl::{
    FSCTL_ENUM_USN_DATA, MFT_ENUM_DATA_V0, USN_RECORD_V2, USN_RECORD_V3,
};
use windows::Win32::System::IO::DeviceIoControl;

#[derive(Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: u64,
    pub parent_id: u64,
    pub name: String,
    #[serde(skip)] // Do not serialize over IPC - saves 40% JSON overhead and memory!
    pub name_lower: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Clone)]
struct RawRecord {
    id: u64,
    parent_id: u64,
    name: String,
    is_dir: bool,
}

pub struct IndexState {
    pub is_indexing: bool,
    pub records: Vec<FileRecord>,
    pub stats: String,
    pub indexed_drives: Vec<String>,
}

lazy_static::lazy_static! {
    pub static ref GLOBAL_INDEX: Arc<RwLock<IndexState>> = Arc::new(RwLock::new(IndexState {
        is_indexing: false,
        records: Vec::new(),
        stats: "Not Indexed".to_string(),
        indexed_drives: Vec::new(),
    }));
}

pub fn get_cache_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("index_cache.bin")
}

pub fn save_cache(path: PathBuf, records: Vec<FileRecord>, indexed_drives: Vec<String>) {
    thread::spawn(move || {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(file) = File::create(path) {
            let mut writer = BufWriter::new(file);
            let _ = bincode::serialize_into(&mut writer, &records);
            let _ = bincode::serialize_into(&mut writer, &indexed_drives);
        }
    });
}

pub fn load_cache(app_handle: &tauri::AppHandle) -> bool {
    let path = get_cache_path(app_handle);
    if let Ok(file) = File::open(&path) {
        let mut reader = BufReader::new(file);
        if let Ok(mut records) = bincode::deserialize_from::<_, Vec<FileRecord>>(&mut reader) {
            // Populate name_lower since it was skipped in serialization
            for r in &mut records {
                r.name_lower = r.name.to_lowercase();
            }
            let drives: Vec<String> = bincode::deserialize_from::<_, Vec<String>>(&mut reader).unwrap_or_else(|_| {
                let mut set = BTreeSet::new();
                for r in &records {
                    if r.path.len() >= 2 && r.path.chars().nth(1) == Some(':') {
                        set.insert(r.path[0..2].to_uppercase());
                    }
                }
                set.into_iter().collect()
            });

            let count = records.len();
            let mut state = GLOBAL_INDEX.write();
            state.records = records;
            state.indexed_drives = drives.clone();
            state.stats = format!("Loaded {} files across drives ({}) from cache", count, drives.join(", "));
            return true;
        }
    }
    false
}

fn get_logical_drives() -> Vec<char> {
    let mut drives = Vec::new();
    let bitmask = unsafe { GetLogicalDrives() };
    for i in 0..26 {
        if (bitmask & (1 << i)) != 0 {
            let letter = (b'A' + i) as char;
            let root_str = format!("{}:\\", letter);
            let root_hstring = HSTRING::from(&root_str);
            let drive_type = unsafe { GetDriveTypeW(&root_hstring) };
            
            // 0 = Unknown, 1 = No root dir, 5 = CD-ROM
            // Skip CD-ROMs and missing root directories
            if drive_type != 1 && drive_type != 5 && Path::new(&root_str).exists() {
                drives.push(letter);
            }
        }
    }
    drives
}

fn get_volume_fs(letter: char) -> String {
    let root_str = format!("{}:\\", letter);
    let root_hstring = HSTRING::from(&root_str);
    let mut fs_buf = [0u16; 260];
    let ok = unsafe {
        GetVolumeInformationW(
            &root_hstring,
            None,
            None,
            None,
            None,
            Some(&mut fs_buf),
        )
    };
    if ok.is_ok() {
        let len = fs_buf.iter().position(|&c| c == 0).unwrap_or(fs_buf.len());
        String::from_utf16_lossy(&fs_buf[..len])
    } else {
        String::new()
    }
}

/// Attempts low-level MFT direct scanning using USN journal
fn scan_drive_mft(drive_letter: char) -> Result<Vec<FileRecord>, String> {
    let drive_path = HSTRING::from(format!("\\\\.\\{}:", drive_letter));

    // Try opening with GENERIC_READ | GENERIC_WRITE first (to allow activating journal if needed)
    let mut handle_res = unsafe {
        CreateFileW(
            &drive_path,
            GENERIC_READ.0 | GENERIC_WRITE.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            None,
        )
    };

    if handle_res.is_err() {
        // Fallback to read-only if write access is denied
        handle_res = unsafe {
            CreateFileW(
                &drive_path,
                GENERIC_READ.0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                None,
            )
        };
    }

    let handle = handle_res.map_err(|e| format!("CreateFileW error: {:?}", e))?;

    // Try activating USN journal if inactive (0x000900e7 = FSCTL_CREATE_USN_JOURNAL)
    #[repr(C)]
    struct CreateUsnJournalData {
        maximum_size: u64,
        allocation_delta: u64,
    }
    let mut create_data = CreateUsnJournalData {
        maximum_size: 0x2000000, // 32MB default
        allocation_delta: 0x400000, // 4MB default
    };
    let mut bytes_ret = 0u32;
    unsafe {
        let _ = DeviceIoControl(
            handle,
            0x000900e7, // FSCTL_CREATE_USN_JOURNAL
            Some(&mut create_data as *mut _ as *mut c_void),
            size_of::<CreateUsnJournalData>() as u32,
            None,
            0,
            Some(&mut bytes_ret),
            None,
        );
    }

    let mut mft_data = MFT_ENUM_DATA_V0 {
        StartFileReferenceNumber: 0,
        LowUsn: 0,
        HighUsn: i64::MAX,
    };

    let mut buffer = vec![0u8; 64 * 1024];
    let mut bytes_returned = 0u32;
    let mut raw_records = HashMap::new();

    loop {
        let result = unsafe {
            DeviceIoControl(
                handle,
                FSCTL_ENUM_USN_DATA,
                Some(&mut mft_data as *mut _ as *mut c_void),
                size_of::<MFT_ENUM_DATA_V0>() as u32,
                Some(buffer.as_mut_ptr() as *mut c_void),
                buffer.len() as u32,
                Some(&mut bytes_returned),
                None,
            )
        };

        if result.is_err() || bytes_returned < 8 {
            break;
        }

        let next_id = unsafe { *(buffer.as_ptr() as *const u64) };
        let mut offset = 8;

        while offset + 8 <= bytes_returned {
            let record_ptr = unsafe { buffer.as_ptr().offset(offset as isize) };
            let record_len = unsafe { *(record_ptr as *const u32) };
            if record_len == 0 || offset + record_len > bytes_returned {
                break;
            }

            let major_version = unsafe { *(record_ptr.offset(4) as *const u16) };

            if major_version == 2 {
                if record_len >= size_of::<USN_RECORD_V2>() as u32 {
                    let record = unsafe { &*(record_ptr as *const USN_RECORD_V2) };
                    if (record.FileNameOffset as u32 + record.FileNameLength as u32) <= record_len {
                        let filename_ptr = unsafe {
                            record_ptr.offset(record.FileNameOffset as isize) as *const u16
                        };
                        let filename_len_u16 = (record.FileNameLength / 2) as usize;
                        let filename_slice = unsafe {
                            std::slice::from_raw_parts(filename_ptr, filename_len_u16)
                        };
                        let filename = OsString::from_wide(filename_slice)
                            .to_string_lossy()
                            .into_owned();

                        let is_dir = (record.FileAttributes & FILE_ATTRIBUTE_DIRECTORY.0) != 0;

                        raw_records.insert(
                            record.FileReferenceNumber,
                            RawRecord {
                                id: record.FileReferenceNumber,
                                parent_id: record.ParentFileReferenceNumber,
                                name: filename,
                                is_dir,
                            },
                        );
                    }
                }
            } else if major_version == 3 {
                if record_len >= size_of::<USN_RECORD_V3>() as u32 {
                    let record = unsafe { &*(record_ptr as *const USN_RECORD_V3) };
                    if (record.FileNameOffset as u32 + record.FileNameLength as u32) <= record_len {
                        let filename_ptr = unsafe {
                            record_ptr.offset(record.FileNameOffset as isize) as *const u16
                        };
                        let filename_len_u16 = (record.FileNameLength / 2) as usize;
                        let filename_slice = unsafe {
                            std::slice::from_raw_parts(filename_ptr, filename_len_u16)
                        };
                        let filename = OsString::from_wide(filename_slice)
                            .to_string_lossy()
                            .into_owned();

                        let is_dir = (record.FileAttributes & FILE_ATTRIBUTE_DIRECTORY.0) != 0;

                        let mut id_arr = [0u8; 8];
                        id_arr.copy_from_slice(&record.FileReferenceNumber.Identifier[0..8]);
                        let id = u64::from_ne_bytes(id_arr);

                        let mut parent_arr = [0u8; 8];
                        parent_arr.copy_from_slice(
                            &record.ParentFileReferenceNumber.Identifier[0..8],
                        );
                        let parent_id = u64::from_ne_bytes(parent_arr);

                        raw_records.insert(
                            id,
                            RawRecord {
                                id,
                                parent_id,
                                name: filename,
                                is_dir,
                            },
                        );
                    }
                }
            }

            offset += record_len;
        }

        mft_data.StartFileReferenceNumber = next_id;
    }

    unsafe {
        let _ = CloseHandle(handle);
    }

    if raw_records.is_empty() {
        return Err(format!("No USN records returned for {}:", drive_letter));
    }

    // Build directory paths for this drive
    let drive_root = format!("{}:\\", drive_letter);
    let mut dir_paths: HashMap<u64, String> = HashMap::new();
    // In NTFS, root directory is file ref #5
    dir_paths.insert(5, drive_root.clone());

    let mut drive_records = Vec::with_capacity(raw_records.len());

    for (_, record) in &raw_records {
        // Skip hidden NTFS metadata entries starting with $ (e.g. $MFT, $LogFile)
        if record.name.starts_with('$') {
            continue;
        }

        let full_path = if record.parent_id == 5 || record.parent_id == record.id {
            format!("{}{}", drive_root, record.name)
        } else {
            // Resolve parent hierarchy
            let mut path_parts = Vec::new();
            let mut current_parent = record.parent_id;
            let mut depth = 0;
            let mut cached_prefix = None;

            while let Some(parent_record) = raw_records.get(&current_parent) {
                if depth > 40 {
                    break;
                }
                if let Some(cached) = dir_paths.get(&current_parent) {
                    cached_prefix = Some(cached.clone());
                    break;
                }
                if current_parent == 5 || parent_record.name == "." {
                    cached_prefix = Some(drive_root.clone());
                    break;
                }

                path_parts.push(parent_record.name.clone());
                if parent_record.parent_id == current_parent {
                    break;
                }
                current_parent = parent_record.parent_id;
                depth += 1;
            }

            let resolved_parent = if let Some(prefix) = cached_prefix {
                if path_parts.is_empty() {
                    prefix.trim_end_matches('\\').to_string()
                } else {
                    path_parts.reverse();
                    format!("{}\\{}", prefix.trim_end_matches('\\'), path_parts.join("\\"))
                }
            } else {
                path_parts.push(drive_root.trim_end_matches('\\').to_string());
                path_parts.reverse();
                path_parts.join("\\")
            };

            dir_paths.insert(record.parent_id, resolved_parent.clone());
            format!("{}\\{}", resolved_parent, record.name)
        };

        drive_records.push(FileRecord {
            id: record.id,
            parent_id: record.parent_id,
            name: record.name.clone(),
            name_lower: record.name.to_lowercase(),
            path: full_path,
            is_dir: record.is_dir,
        });
    }

    Ok(drive_records)
}

/// Fallback fast directory walker for non-NTFS drives, FAT32/exFAT, or when raw MFT access fails
fn scan_drive_walk(drive_letter: char) -> Vec<FileRecord> {
    let root = format!("{}:\\", drive_letter);
    let mut records = Vec::new();
    let mut dirs_to_visit = vec![PathBuf::from(&root)];
    let mut virtual_id: u64 = 1_000_000_000 + ((drive_letter as u64) << 32);

    while let Some(current_dir) = dirs_to_visit.pop() {
        if let Ok(entries) = std::fs::read_dir(&current_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    // Skip symlinks & junctions to prevent infinite loops
                    if file_type.is_symlink() {
                        continue;
                    }
                    let is_dir = file_type.is_dir();
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let path = entry.path().to_string_lossy().into_owned();

                    // Skip system volume info and recycle bins
                    let lower = name.to_lowercase();
                    if lower == "$recycle.bin" || lower == "system volume information" {
                        continue;
                    }

                    virtual_id += 1;
                    records.push(FileRecord {
                        id: virtual_id,
                        parent_id: 0,
                        name: name.clone(),
                        name_lower: lower,
                        path,
                        is_dir,
                    });

                    if is_dir {
                        dirs_to_visit.push(entry.path());
                    }
                }
            }
        }
    }
    records
}

pub fn start_indexing(cache_path: Option<PathBuf>) {
    let mut state = GLOBAL_INDEX.write();
    if state.is_indexing {
        return;
    }
    state.is_indexing = true;
    state.stats = "Scanning files on all detected drives...".to_string();
    drop(state);

    thread::spawn(move || {
        let start_time = Instant::now();
        let mut all_records = Vec::new();
        let drives = get_logical_drives();
        let mut drives_indexed = Vec::new();

        for drive_letter in drives {
            let fs_type = get_volume_fs(drive_letter);
            let (drive_records, used_mft) = if fs_type.eq_ignore_ascii_case("NTFS") {
                match scan_drive_mft(drive_letter) {
                    Ok(records) => (records, true),
                    Err(_) => (scan_drive_walk(drive_letter), false),
                }
            } else {
                (scan_drive_walk(drive_letter), false)
            };

            if !drive_records.is_empty() {
                drives_indexed.push(format!("{}: ({})", drive_letter, if used_mft { "MFT" } else { "Scan" }));
                all_records.extend(drive_records);
            }
        }

        let duration = start_time.elapsed();
        let mut state = GLOBAL_INDEX.write();
        state.records = all_records;
        state.is_indexing = false;
        
        let mut drives_set = BTreeSet::new();
        for r in &state.records {
            if r.path.len() >= 2 && r.path.chars().nth(1) == Some(':') {
                drives_set.insert(r.path[0..2].to_uppercase());
            }
        }
        let unique_drives: Vec<String> = drives_set.into_iter().collect();
        state.indexed_drives = unique_drives.clone();

        state.stats = format!(
            "Indexed {} files across {} drives ({}) in {:.2?}",
            state.records.len(),
            unique_drives.len(),
            unique_drives.join(", "),
            duration
        );

        if let Some(path) = cache_path {
            save_cache(path, state.records.clone(), unique_drives);
        }
    });
}

pub fn search(query: &str) -> Vec<FileRecord> {
    let state = GLOBAL_INDEX.read();
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Vec::new();
    }

    // Check if query targets a drive (e.g. "d:", "d:\", "d: notes")
    let (drive_filter, search_term) = if q.len() >= 2 && q.chars().nth(1) == Some(':') {
        let drive_letter = q.chars().next().unwrap().to_ascii_uppercase();
        let rest = q[2..].trim_start_matches(|c| c == '\\' || c == '/' || c == ' ').trim();
        (Some(drive_letter), rest)
    } else {
        (None, q.as_str())
    };

    let is_path_search = search_term.contains('\\') || search_term.contains('/');
    let max_results = 1500; // Optimal limit for zero IPC lag & ultra-fast rendering

    let mut exact_matches = Vec::new();
    let mut prefix_matches = Vec::new();
    let mut contains_matches = Vec::new();

    for r in state.records.iter() {
        // If a drive filter is specified, enforce it
        if let Some(df) = drive_filter {
            if !r.path.starts_with(&format!("{}:", df)) && !r.path.starts_with(&format!("{}:", df.to_ascii_lowercase())) {
                continue;
            }
        }

        // If search term is empty (e.g. user just typed "d:"), return all files on that drive
        if search_term.is_empty() {
            exact_matches.push(r.clone());
            if exact_matches.len() >= max_results {
                break;
            }
            continue;
        }

        if is_path_search {
            if r.path.to_lowercase().contains(search_term) {
                contains_matches.push(r.clone());
                if contains_matches.len() >= max_results {
                    break;
                }
            }
        } else {
            if r.name_lower == search_term {
                exact_matches.push(r.clone());
            } else if r.name_lower.starts_with(search_term) {
                prefix_matches.push(r.clone());
            } else if r.name_lower.contains(search_term) {
                contains_matches.push(r.clone());
            }

            if exact_matches.len() + prefix_matches.len() + contains_matches.len() >= max_results * 2 {
                break;
            }
        }
    }

    let mut results = exact_matches;
    results.extend(prefix_matches);
    results.extend(contains_matches);
    results.truncate(max_results);
    results
}
