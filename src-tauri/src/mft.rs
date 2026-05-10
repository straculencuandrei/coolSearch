#![allow(non_snake_case)]
#![allow(non_camel_case_types)]

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use std::collections::HashMap;
use std::ffi::{c_void, OsString};
use std::mem::size_of;
use std::os::windows::ffi::OsStringExt;

use windows::core::HSTRING;
use windows::Win32::Foundation::{CloseHandle, GENERIC_READ};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, GetLogicalDrives, FILE_ATTRIBUTE_DIRECTORY, FILE_FLAG_BACKUP_SEMANTICS,
    FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
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
}

lazy_static::lazy_static! {
    pub static ref GLOBAL_INDEX: Arc<RwLock<IndexState>> = Arc::new(RwLock::new(IndexState {
        is_indexing: false,
        records: Vec::new(),
        stats: String::new(),
    }));
}

pub fn start_indexing() {
    let mut state = GLOBAL_INDEX.write();
    if state.is_indexing {
        return;
    }
    state.is_indexing = true;
    state.stats = "Scanning MFT on C:\\...".to_string();
    drop(state);

    thread::spawn(|| {
        let start_time = Instant::now();
        let mut raw_records = HashMap::new();
        let mut error_msg = String::new();

        let drive_path = HSTRING::from("\\\\.\\C:");
        let handle_result = unsafe {
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

        if let Ok(handle) = handle_result {
            let mut mft_data = MFT_ENUM_DATA_V0 {
                StartFileReferenceNumber: 0,
                LowUsn: 0,
                HighUsn: i64::MAX,
            };

            let mut buffer = vec![0u8; 64 * 1024];
            let mut bytes_returned = 0u32;

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
                        if record_len < size_of::<USN_RECORD_V2>() as u32 { break; }
                        let record = unsafe { &*(record_ptr as *const USN_RECORD_V2) };
                        if (record.FileNameOffset as u32 + record.FileNameLength as u32) > record_len { break; }

                        let filename_ptr = unsafe {
                            record_ptr.offset(record.FileNameOffset as isize) as *const u16
                        };
                        let filename_len_u16 = (record.FileNameLength / 2) as usize;
                        let filename_slice =
                            unsafe { std::slice::from_raw_parts(filename_ptr, filename_len_u16) };
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
                    } else if major_version == 3 {
                        if record_len < size_of::<USN_RECORD_V3>() as u32 { break; }
                        let record = unsafe { &*(record_ptr as *const USN_RECORD_V3) };
                        if (record.FileNameOffset as u32 + record.FileNameLength as u32) > record_len { break; }

                        let filename_ptr = unsafe {
                            record_ptr.offset(record.FileNameOffset as isize) as *const u16
                        };
                        let filename_len_u16 = (record.FileNameLength / 2) as usize;
                        let filename_slice =
                            unsafe { std::slice::from_raw_parts(filename_ptr, filename_len_u16) };
                        let filename = OsString::from_wide(filename_slice)
                            .to_string_lossy()
                            .into_owned();

                        let is_dir = (record.FileAttributes & FILE_ATTRIBUTE_DIRECTORY.0) != 0;

                        let mut id_arr = [0u8; 8];
                        id_arr.copy_from_slice(&record.FileReferenceNumber.Identifier[0..8]);
                        let id = u64::from_ne_bytes(id_arr);

                        let mut parent_arr = [0u8; 8];
                        parent_arr
                            .copy_from_slice(&record.ParentFileReferenceNumber.Identifier[0..8]);
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

                    offset += record_len;
                }

                mft_data.StartFileReferenceNumber = next_id;
            }

            unsafe {
                let _ = CloseHandle(handle);
            }
        } else {
            error_msg = format!(
                "Failed to open C: (Code: {:?})",
                handle_result.err().unwrap()
            );
        }

        let mut final_records = Vec::with_capacity(raw_records.len());

        if error_msg.is_empty() {
            for (_, record) in &raw_records {
                let mut path_parts = Vec::new();
                path_parts.push(record.name.clone());

                let mut current_parent = record.parent_id;
                let mut depth = 0;
                while let Some(parent_record) = raw_records.get(&current_parent) {
                    if depth > 30 {
                        break;
                    }
                    path_parts.push(parent_record.name.clone());
                    if parent_record.parent_id == current_parent {
                        break;
                    }
                    current_parent = parent_record.parent_id;
                    depth += 1;
                }

                path_parts.push("C:".to_string());
                path_parts.reverse();
                let full_path = path_parts.join("\\");

                final_records.push(FileRecord {
                    id: record.id,
                    parent_id: record.parent_id,
                    name: record.name.clone(),
                    path: full_path,
                    is_dir: record.is_dir,
                });
            }
        }

        let duration = start_time.elapsed();
        let mut state = GLOBAL_INDEX.write();
        state.records = final_records;
        state.is_indexing = false;

        if !error_msg.is_empty() {
            state.stats = format!("Error: {}", error_msg);
        } else {
            state.stats = format!("Indexed {} files in {:?}", state.records.len(), duration);
        }
    });
}

#[allow(dead_code)]
fn get_logical_drives() -> Vec<char> {
    let mut drives = Vec::new();
    let bitmask = unsafe { GetLogicalDrives() };
    for i in 0..26 {
        if (bitmask & (1 << i)) != 0 {
            let letter = (b'A' + i) as char;
            drives.push(letter);
        }
    }
    drives
}

pub fn search(query: &str, limit: usize) -> Vec<FileRecord> {
    let state = GLOBAL_INDEX.read();
    let q = query.to_lowercase();

    // Fast parallel search (mocked as sequential for simplicity, rayon can be used)
    state
        .records
        .iter()
        .filter(|r| r.name.to_lowercase().contains(&q))
        .take(limit)
        .cloned()
        .collect()
}
