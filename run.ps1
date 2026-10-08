<#
.SYNOPSIS
    Launcher script for coolSearch (NTFS MFT File Search Utility).
.DESCRIPTION
    Checks prerequisites (Node.js, Rust/Cargo, MSVC Build Tools, Admin rights),
    installs missing frontend dependencies, and runs the application.
.PARAMETER Mode
    'tauri' (default) - Full desktop application via Tauri (requires Rust & Administrator)
    'frontend'        - Vite web dev server only (for UI preview, does not require Rust)
    'build'           - Build release desktop binary (npm run tauri build)
.PARAMETER NoElevation
    Do not prompt to elevate to Administrator.
.PARAMETER InstallRust
    Automatically install Rustup via winget if Rust is missing.
#>
param(
    [ValidateSet('tauri', 'frontend', 'build')]
    [string]$Mode = 'tauri',
    [switch]$NoElevation,
    [switch]$InstallRust
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 65) -ForegroundColor Cyan
    Write-Host "   $Text" -ForegroundColor White
    Write-Host ("=" * 65) -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success { param([string]$msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn    { param([string]$msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err     { param([string]$msg) Write-Host "[-] $msg" -ForegroundColor Red }
function Write-Info    { param([string]$msg) Write-Host "[*] $msg" -ForegroundColor Cyan }

function Test-IsAdmin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Header "coolSearch Launcher"

# 1. Check Administrator Rights
$isAdmin = Test-IsAdmin
if ($isAdmin) {
    Write-Success "Running with Administrator privileges (required for NTFS MFT direct access)."
} else {
    Write-Warn "Not running as Administrator."
    Write-Warn "coolSearch requires Administrator privileges to read the NTFS Master File Table (MFT)."
    
    if (-not $NoElevation -and $Mode -ne 'frontend') {
        Write-Info "Requesting elevation..."
        try {
            $argList = "-ExecutionPolicy Bypass -NoProfile -File `"$($MyInvocation.MyCommand.Definition)`" -Mode $Mode"
            if ($InstallRust) { $argList += " -InstallRust" }
            Start-Process powershell -Verb RunAs -ArgumentList $argList
            Write-Success "Elevated launcher started in a new window. Exiting this non-elevated session."
            Exit 0
        } catch {
            Write-Warn "Could not automatically elevate: $_"
            Write-Warn "Continuing in non-elevated mode. Note: Searching files may fail if NTFS MFT access is blocked."
        }
    }
}

# 2. Check Node.js and npm
Write-Info "Checking Node.js & npm..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js is not found in PATH! Please install Node.js (https://nodejs.org/)."
    Read-Host "Press Enter to exit"
    Exit 1
}
$nodeVer = (node -v).Trim()
Write-Success "Found Node.js: $nodeVer"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm is not found in PATH! Please install npm."
    Read-Host "Press Enter to exit"
    Exit 1
}
$npmVer = (npm -v).Trim()
Write-Success "Found npm: $npmVer"

# 3. Ensure icon-neco.png exists (fixes Vite build missing asset bug)
$iconNeco = Join-Path $ScriptDir "src\icon-neco.png"
if (-not (Test-Path $iconNeco)) {
    $fallbackIcon = Join-Path $ScriptDir "src-tauri\icons\32x32.png"
    if (Test-Path $fallbackIcon) {
        Write-Info "Restoring missing src/icon-neco.png from icons..."
        Copy-Item -Path $fallbackIcon -Destination $iconNeco
        Write-Success "Restored src/icon-neco.png"
    }
}

# 4. Check node_modules
if (-not (Test-Path (Join-Path $ScriptDir "node_modules"))) {
    Write-Info "node_modules not found. Running npm install..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install failed with exit code $LASTEXITCODE."
        Read-Host "Press Enter to exit"
        Exit 1
    }
    Write-Success "Frontend dependencies installed successfully."
}

# If Frontend-Only mode requested
if ($Mode -eq 'frontend') {
    Write-Header "Starting Frontend Dev Server (UI Preview Mode)"
    Write-Info "Local URL: http://localhost:1420/"
    Write-Warn "Note: Desktop IPC commands (NTFS MFT search) will only respond when running full desktop Tauri app."
    npm run dev
    Exit 0
}

# 5. Check Rust & Cargo
Write-Info "Checking Rust toolchain (cargo & rustc)..."

# Refresh environment PATH in case rust was installed in another session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$cargoFound = [bool](Get-Command cargo -ErrorAction SilentlyContinue)
$cargoProfile = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"

if (-not $cargoFound -and (Test-Path $cargoProfile)) {
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
    $cargoFound = [bool](Get-Command cargo -ErrorAction SilentlyContinue)
}

if (-not $cargoFound) {
    Write-Warn "Rust compiler (cargo / rustc) was not found in PATH."
    Write-Info "coolSearch's MFT indexing engine is written in Rust and requires the Rust toolchain."
    
    $shouldInstall = $false
    if ($InstallRust) {
        $shouldInstall = $true
    } else {
        Write-Host ""
        Write-Host "Choose an option:" -ForegroundColor Yellow
        Write-Host "  [1] Automatically install Rust via winget now"
        Write-Host "  [2] Run Frontend Dev Server only (Vite preview at http://localhost:1420)"
        Write-Host "  [3] Exit"
        Write-Host ""
        $choice = Read-Host "Enter your choice (1, 2, or 3) [Default: 1]"
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }
        
        switch ($choice) {
            "1" { $shouldInstall = $true }
            "2" {
                Write-Header "Starting Frontend Dev Server"
                npm run dev
                Exit 0
            }
            default {
                Write-Info "Exiting. You can install Rust manually from https://rustup.rs/"
                Exit 0
            }
        }
    }

    if ($shouldInstall) {
        Write-Info "Installing Rustup via winget..."
        winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
        
        # Re-check cargo path after install
        if (Test-Path $cargoProfile) {
            $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
        }
        
        if (Get-Command cargo -ErrorAction SilentlyContinue) {
            Write-Success "Rust installed successfully!"
        } else {
            Write-Warn "Rust installation finished. You may need to restart your terminal or complete rustup setup."
            Write-Info "Run 'rustup default stable' or open a new elevated terminal, then re-run this script."
            Read-Host "Press Enter to exit"
            Exit 0
        }
    }
} else {
    $rustVer = (rustc --version).Trim()
    $cargoVer = (cargo --version).Trim()
    Write-Success "Found Rust: $rustVer"
    Write-Success "Found Cargo: $cargoVer"
}

# 6. Run Mode (Tauri Dev or Tauri Build)
if ($Mode -eq 'build') {
    Write-Header "Building coolSearch Release App"
    npm run tauri build
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Build complete! Check src-tauri/target/release/ for the executable."
    }
} else {
    Write-Header "Starting coolSearch Desktop App (Tauri Dev Mode)"
    Write-Info "Launching Vite dev server + Tauri native window..."
    npm run tauri dev
}
