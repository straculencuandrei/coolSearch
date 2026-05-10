# coolSearch

A high-performance, instantaneous file search utility for Windows built with Tauri, Rust, and React.

## Description

**coolSearch** is designed for extreme speed. While traditional search tools crawl your folders one by one, coolSearch talks directly to your hard drive's "internal map" (the Master File Table) to find every single file on your computer in less than a second. It combines the raw power of Rust with a sleek, modern React interface to make finding files feel instant.

## How It Works (From the Ground Up)

To achieve near-instantaneous indexing of an entire hard drive, coolSearch bypasses standard file system APIs and interacts directly with the low-level storage structures of Windows.

### 1. Privilege Elevation & Volume Access
Accessing the raw data of a hard drive is a sensitive operation. coolSearch is configured with a custom Windows Manifest that requests **Administrator privileges** on startup. This elevation allows the Rust backend to open a "raw handle" to the physical volume (like `\\.\C:`) using the Windows `CreateFileW` API.

### 2. MFT Enumeration via USN Journal
The secret to the app's speed is the **Master File Table (MFT)**. The MFT is a hidden system file that NTFS uses to track every file and folder on a volume. 

Instead of searching through folders manually, coolSearch uses the Windows `DeviceIoControl` API with the `FSCTL_ENUM_USN_DATA` command. This tells the Windows kernel to stream the metadata of every file directly into our app's memory in massive chunks. This is orders of magnitude faster than traditional folder-walking because it avoids the overhead of opening every individual directory.

### 3. Tree Path Resolution
The raw data from the MFT doesn't actually store full paths (like `C:\Windows\System32\cmd.exe`). Instead, it stores the file's name and a **Parent Reference ID**. 

To reconstruct the full path:
1. **Pass 1 (Ingestion):** coolSearch builds a high-speed in-memory map of every File ID and its associated name.
2. **Pass 2 (Resolution):** For every file found, the engine "walks up" the parent IDs until it reaches the root of the drive, joining the names together to create the absolute file path.

### 4. Fluid Frontend & IPC
The frontend is a modern **React** application that communicates with the Rust engine via **Tauri**. 
- **Virtualized Rendering:** To handle results that could contain millions of files, we use **virtualized lists**. This ensures that the browser only renders the few dozen files you see on the screen at any given time, keeping the UI buttery smooth.
- **Tauri IPC:** Search queries are sent from the search bar to the Rust engine through an asynchronous bridge, allowing the search to happen in a background thread without ever freezing the interface.

## Security & Hardening

Given its high-privilege nature, coolSearch implements several layers of security to ensure system integrity:

- **Memory-Safe MFT Parsing:** The Rust backend implements strict boundary validation for all USN journal records, preventing buffer overflows or out-of-bounds reads from malformed filesystem data.
- **Path Sanitization:** All filesystem actions (Metadata, Copy Path, Open Explorer) are protected by a validation layer that enforces absolute path usage and prevents directory traversal attacks (`..`).
- **Content Security Policy (CSP):** The frontend is restricted by a strict CSP, allowing the `asset:` protocol only for local image rendering while blocking unauthorized external resources.

