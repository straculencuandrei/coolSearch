<#
.SYNOPSIS
    Professional Release Build & Packaging Automation for coolSearch.
.DESCRIPTION
    Automates building, compiling, and packaging coolSearch for official releases:
      [1/5] Pre-flight Environment & Toolchain Verification
      [2/5] Asset Preparation & Workspace Staging
      [3/5] Frontend Production Build (TypeScript + Vite)
      [4/5] Native Rust Engine Compilation & Tauri Bundling
      [5/5] Release Artifact Assembly (Portable Exe, ZIP, Checksums, Manifest)
.PARAMETER SkipBundle
    Compiles release executable without building MSI/NSIS installer (faster).
.PARAMETER NoOpenFolder
    Suppresses opening the release directory in Windows Explorer upon completion.
#>
[CmdletBinding()]
param(
    [switch]$SkipBundle,
    [switch]$NoOpenFolder
)

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "coolSearch - Release Builder"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

# Ensure Cargo is in PATH
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $cargoProfile = Join-Path $env:USERPROFILE ".cargo\bin"
    if (Test-Path (Join-Path $cargoProfile "cargo.exe")) {
        $env:Path = "$cargoProfile;$env:Path"
    }
}

# Animation frames & ASCII styling
$SpinnerFrames = @('|', '/', '-', '\')
$BarFilled = '='
$BarEmpty = '.'

function Show-Banner {
    param([string]$Version)
    Clear-Host
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor DarkCyan
    Write-Host "    COOLSEARCH RELEASE COMPILATION & PACKAGING SUITE             " -ForegroundColor Cyan
    Write-Host "    Version: $Version                                            " -ForegroundColor White
    Write-Host "    Target:  Windows x86_64 (NTFS MFT Fast Indexer)              " -ForegroundColor DarkGray
    Write-Host "  ================================================================" -ForegroundColor DarkCyan
    Write-Host ""
}

function Format-TimeSpan {
    param([double]$Seconds)
    $ts = [TimeSpan]::FromSeconds($Seconds)
    if ($ts.TotalHours -ge 1) {
        return "{0:D2}:{1:D2}:{2:D2}" -f [int]$ts.TotalHours, $ts.Minutes, $ts.Seconds
    }
    return "{0:D2}:{1:D2}" -f $ts.Minutes, $ts.Seconds
}

function Render-ProgressBar {
    param(
        [int]$StepIndex,
        [int]$TotalSteps,
        [string]$SubStatus,
        [string]$SpinnerChar,
        [double]$ElapsedSec,
        [int]$BarWidth = 24
    )

    $percent = [math]::Round(($StepIndex / $TotalSteps) * 100)
    $filledLength = [math]::Round(($percent / 100) * $BarWidth)
    $emptyLength = $BarWidth - $filledLength

    $bar = ($BarFilled * $filledLength) + ($BarEmpty * $emptyLength)
    $timeStr = Format-TimeSpan $ElapsedSec

    $line = "  [$SpinnerChar] Step $StepIndex/${TotalSteps} [$bar] {0,3}% | {1,-32} | Time: {2}" -f $percent, $SubStatus, $timeStr
    if ($line.Length -gt 115) {
        $line = $line.Substring(0, 112) + "..."
    }

    Write-Host -NoNewline ("`r" + $line.PadRight(118))
}

function Write-StepDone {
    param(
        [int]$StepIndex,
        [int]$TotalSteps,
        [string]$Title,
        [double]$DurationSec
    )
    $timeStr = [math]::Round($DurationSec, 1).ToString("0.0") + "s"
    Write-Host -NoNewline ("`r" + (" " * 118) + "`r")
    Write-Host "  [OK] Step $StepIndex/${TotalSteps}: $Title" -ForegroundColor Green -NoNewline
    Write-Host " (Done in $timeStr)" -ForegroundColor DarkGray
}

function Write-StepFailed {
    param(
        [int]$StepIndex,
        [int]$TotalSteps,
        [string]$Title,
        [string]$ErrorMsg
    )
    Write-Host -NoNewline ("`r" + (" " * 118) + "`r")
    Write-Host "  [FAIL] Step $StepIndex/${TotalSteps}: $Title FAILED!" -ForegroundColor Red
    if ($ErrorMsg) {
        Write-Host "         Details: $ErrorMsg" -ForegroundColor Yellow
    }
}

function Invoke-StepWithProgress {
    param(
        [int]$StepIndex,
        [int]$TotalSteps,
        [string]$Title,
        [scriptblock]$Action
    )

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $subStatus = "Working..."
    $frameIdx = 0

    $job = Start-Job -ScriptBlock $Action -ArgumentList $ScriptDir, [bool]$SkipBundle

    while ($job.State -eq 'Running') {
        $spinner = $SpinnerFrames[$frameIdx % $SpinnerFrames.Count]
        $frameIdx++

        $latest = Receive-Job -Job $job -ErrorAction SilentlyContinue
        if ($latest) {
            foreach ($item in $latest) {
                $str = "$item".Trim()
                if ($str -match 'Compiling\s+(\S+)') {
                    $subStatus = "Compiling " + $Matches[1]
                } elseif ($str -match 'Building\s+(\S+)') {
                    $subStatus = "Building " + $Matches[1]
                } elseif ($str -match 'transforming|rendering|chunks') {
                    $subStatus = "Bundling frontend assets"
                } elseif ($str -match 'bundle|MSI|NSIS|candle|light|makensis') {
                    $subStatus = "Packaging installer"
                } elseif ($str -match 'Finished\s+`release`') {
                    $subStatus = "Linking application binary"
                } elseif ($str.Length -gt 0 -and $str.Length -lt 32) {
                    $subStatus = $str
                }
            }
        }

        Render-ProgressBar -StepIndex $StepIndex -TotalSteps $TotalSteps -SubStatus $subStatus -SpinnerChar $spinner -ElapsedSec $stopwatch.Elapsed.TotalSeconds
        Start-Sleep -Milliseconds 85
    }

    $stopwatch.Stop()
    $jobResult = Receive-Job -Job $job -ErrorAction SilentlyContinue
    $jobState = $job.State
    $jobReason = $job.ChildJobs[0].JobStateInfo.Reason
    Remove-Job -Job $job -Force

    if ($jobState -ne 'Completed') {
        Write-StepFailed -StepIndex $StepIndex -TotalSteps $TotalSteps -Title $Title -ErrorMsg "$jobReason"
        throw "Step $Title failed during execution."
    }

    Write-StepDone -StepIndex $StepIndex -TotalSteps $TotalSteps -Title $Title -DurationSec $stopwatch.Elapsed.TotalSeconds
    return $jobResult
}

# ========================================================
# MAIN EXECUTION WORKFLOW
# ========================================================
$TotalStart = [System.Diagnostics.Stopwatch]::StartNew()

$tauriConfigPath = Join-Path $ScriptDir "src-tauri\tauri.conf.json"
$appVersion = "0.4.0"
$appName = "coolSearch"

if (Test-Path $tauriConfigPath) {
    try {
        $json = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json
        if ($json.version) { $appVersion = $json.version }
        if ($json.productName) { $appName = $json.productName }
    } catch {}
}

Show-Banner -Version "v$appVersion"

Write-Host "  Starting release packaging pipeline..." -ForegroundColor DarkGray
Write-Host ""

$TOTAL_STEPS = 5

# --- STEP 1: Toolchain & Environment Check ---
$step1Action = {
    param($workDir)
    $ErrorActionPreference = "Continue"
    Set-Location $workDir

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js not found in PATH."
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm not found in PATH."
    }

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        $cargoProfile = Join-Path $env:USERPROFILE ".cargo\bin"
        if (Test-Path (Join-Path $cargoProfile "cargo.exe")) {
            $env:Path = "$cargoProfile;$env:Path"
        }
    }

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        throw "Rust / Cargo not found in PATH. Make sure Rust is installed."
    }

    Start-Sleep -Milliseconds 300
    return "Toolchain verified."
}

try {
    Invoke-StepWithProgress -StepIndex 1 -TotalSteps $TOTAL_STEPS -Title "Toolchain & Environment Verification" -Action $step1Action | Out-Null
} catch {
    Write-Host "`n  Fatal: $($_.Exception.Message)" -ForegroundColor Red
    Exit 1
}

# --- STEP 2: Asset Staging & Cleaning ---
$step2Action = {
    param($workDir)
    $ErrorActionPreference = "Continue"
    Set-Location $workDir

    # Ensure icon-neco.png exists
    $iconNeco = Join-Path $workDir "src\icon-neco.png"
    if (-not (Test-Path $iconNeco)) {
        $fallbackIcon = Join-Path $workDir "src-tauri\icons\32x32.png"
        if (Test-Path $fallbackIcon) {
            Copy-Item -Path $fallbackIcon -Destination $iconNeco -Force
        }
    }

    # Low disk space safeguard (< 2GB): clean debug artifacts
    $drive = (Get-Item $workDir).PSDrive
    if ($drive -and $drive.Free -lt (2GB)) {
        $dbgDir = Join-Path $workDir "src-tauri\target\debug"
        if (Test-Path $dbgDir) {
            Remove-Item -Path $dbgDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Ensure clean release destination
    $releaseDir = Join-Path $workDir "release"
    if (-not (Test-Path $releaseDir)) {
        New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
    }

    Start-Sleep -Milliseconds 250
    return "Staging prepared."
}

try {
    Invoke-StepWithProgress -StepIndex 2 -TotalSteps $TOTAL_STEPS -Title "Asset Staging & Workspace Preparation" -Action $step2Action | Out-Null
} catch {
    Write-Host "`n  Fatal: $($_.Exception.Message)" -ForegroundColor Red
    Exit 1
}

# --- STEP 3: Frontend Compilation (Vite + TypeScript) ---
$step3Action = {
    param($workDir)
    $ErrorActionPreference = "Continue"
    Set-Location $workDir

    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend compilation failed with exit code $LASTEXITCODE."
    }
    return "Frontend bundle generated."
}

try {
    Invoke-StepWithProgress -StepIndex 3 -TotalSteps $TOTAL_STEPS -Title "Frontend Production Bundle (TypeScript + Vite)" -Action $step3Action | Out-Null
} catch {
    Write-Host "`n  Fatal: $($_.Exception.Message)" -ForegroundColor Red
    Exit 1
}

# --- STEP 4: Native Rust Engine Compilation & Tauri Build ---
$step4Action = {
    param($workDir, $noBundle)
    $ErrorActionPreference = "Continue"
    Set-Location $workDir

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        $cargoProfile = Join-Path $env:USERPROFILE ".cargo\bin"
        if (Test-Path (Join-Path $cargoProfile "cargo.exe")) {
            $env:Path = "$cargoProfile;$env:Path"
        }
    }

    if ($noBundle) {
        & npx.cmd tauri build --no-bundle
    } else {
        & npx.cmd tauri build
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Tauri build exited with code $LASTEXITCODE."
    }

    return "Native build complete."
}

try {
    Invoke-StepWithProgress -StepIndex 4 -TotalSteps $TOTAL_STEPS -Title "Rust NTFS MFT Engine & Native Packaging" -Action $step4Action | Out-Null
} catch {
    Write-Host "`n  Fatal: $($_.Exception.Message)" -ForegroundColor Red
    Exit 1
}

# --- STEP 5: Assembly, Checksums & Manifest ---
$step5Action = {
    param($workDir)
    $ErrorActionPreference = "Continue"
    Set-Location $workDir

    $appVersion = "0.4.0"
    $appName = "coolSearch"
    $conf = Join-Path $workDir "src-tauri\tauri.conf.json"
    if (Test-Path $conf) {
        try {
            $j = Get-Content $conf -Raw | ConvertFrom-Json
            if ($j.version) { $appVersion = $j.version }
            if ($j.productName) { $appName = $j.productName }
        } catch {}
    }

    $releaseDir = Join-Path $workDir "release"
    Get-ChildItem -Path $releaseDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*coolSearch-v-*" } | Remove-Item -Force -ErrorAction SilentlyContinue
    $targetRelease = Join-Path $workDir "src-tauri\target\release"
    $bundleDir = Join-Path $targetRelease "bundle"

    # 1. Locate primary executable
    $srcExe = Join-Path $targetRelease "coolSearch.exe"
    if (-not (Test-Path $srcExe)) {
        $altExe = Join-Path $targetRelease "cool-search.exe"
        if (Test-Path $altExe) { $srcExe = $altExe }
    }

    if (-not (Test-Path $srcExe)) {
        throw "Could not find built executable at $srcExe"
    }

    # 2. Copy standalone portable executable
    $outExe = Join-Path $releaseDir "coolSearch-v$appVersion-x64-portable.exe"
    Copy-Item -Path $srcExe -Destination $outExe -Force

    # 3. Copy standard coolSearch.exe
    $standardExe = Join-Path $releaseDir "coolSearch.exe"
    Copy-Item -Path $srcExe -Destination $standardExe -Force

    # 4. Copy generated installers (MSI / NSIS)
    if (Test-Path $bundleDir) {
        Get-ChildItem -Path $bundleDir -Recurse -Include *.msi, *.exe | ForEach-Object {
            $destName = $_.Name
            Copy-Item -Path $_.FullName -Destination (Join-Path $releaseDir $destName) -Force
        }
    }

    # 5. Create Portable Release ZIP
    $zipArchive = Join-Path $releaseDir "coolSearch-v$appVersion-windows-x64.zip"
    if (Test-Path $zipArchive) { Remove-Item $zipArchive -Force }

    $stagingTemp = Join-Path $env:TEMP ("coolSearch_pack_" + [Guid]::NewGuid().ToString().Substring(0,8))
    New-Item -ItemType Directory -Path $stagingTemp -Force | Out-Null

    Copy-Item -Path $srcExe -Destination (Join-Path $stagingTemp "coolSearch.exe")
    if (Test-Path (Join-Path $workDir "README.md")) {
        Copy-Item -Path (Join-Path $workDir "README.md") -Destination (Join-Path $stagingTemp "README.md")
    }
    if (Test-Path (Join-Path $workDir "LICENSE")) {
        Copy-Item -Path (Join-Path $workDir "LICENSE") -Destination (Join-Path $stagingTemp "LICENSE")
    }

    Compress-Archive -Path "$stagingTemp\*" -DestinationPath $zipArchive -CompressionLevel Optimal
    Remove-Item -Path $stagingTemp -Recurse -Force -ErrorAction SilentlyContinue

    # 6. Generate SHA256 Checksums
    $checksumFile = Join-Path $releaseDir "SHA256SUMS.txt"
    $checksums = @()
    Get-ChildItem -Path $releaseDir -File | Where-Object { $_.Name -ne "SHA256SUMS.txt" -and $_.Name -ne "release-manifest.json" } | ForEach-Object {
        $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower()
        $checksums += "$hash  $($_.Name)"
    }
    $checksums | Set-Content -Path $checksumFile -Encoding UTF8

    # 7. Generate release-manifest.json
    $manifest = [ordered]@{
        name         = $appName
        version      = $appVersion
        target       = "x86_64-pc-windows-msvc"
        build_date   = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        files        = @()
    }

    Get-ChildItem -Path $releaseDir -File | Where-Object { $_.Name -ne "release-manifest.json" } | ForEach-Object {
        $manifest.files += @{
            filename = $_.Name
            size     = $_.Length
            sha256   = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower()
        }
    }

    $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $releaseDir "release-manifest.json") -Encoding UTF8

    # 8. Generate & Synchronize version_manifest.json for OTA In-App Updates (wznotes pattern)
    $versionManifestPath = Join-Path $workDir "version_manifest.json"
    $existingNotes = "• Fast NTFS Indexing: Instant drive indexing with parent directory memoization.`n• Exact Match Search Filter: Instant toggle to match exact filenames ignoring extensions.`n• Dynamic Extension Selector: Real-time extension breakdown dropdown with item counts.`n• Adaptive Keystroke Debouncing: Smooth keystroke processing for million-file search indices.`n• React Rendering Optimization: 60FPS UI transitions with memoized file results.`n• Instant In-App Updates: Instant OTA update detection, progress tracking, and one-click installation."
    $buildNum = 1
    if (Test-Path $versionManifestPath) {
        try {
            $oldManifest = Get-Content $versionManifestPath -Raw | ConvertFrom-Json
            if ($oldManifest.release_notes) { $existingNotes = $oldManifest.release_notes }
            if ($oldManifest.build_number) { $buildNum = [int]$oldManifest.build_number + 1 }
        } catch {}
    }

    $nsisInstaller = Get-ChildItem -Path $releaseDir -File -Filter "*setup.exe" | Select-Object -First 1
    $msiInstaller = Get-ChildItem -Path $releaseDir -File -Filter "*.msi" | Select-Object -First 1
    $installerName = if ($nsisInstaller) { $nsisInstaller.Name } else { "coolSearch_${appVersion}_x64-setup.exe" }
    $msiName = if ($msiInstaller) { $msiInstaller.Name } else { "coolSearch_${appVersion}_x64_en-US.msi" }

    $versionManifest = [ordered]@{
        version        = $appVersion
        build_number   = $buildNum
        title          = "coolSearch v$appVersion Update"
        release_notes  = $existingNotes
        windows_url    = "https://github.com/straculencuandrei/coolSearch/releases/download/v$appVersion/$installerName"
        portable_url   = "https://github.com/straculencuandrei/coolSearch/releases/download/v$appVersion/coolSearch.exe"
        msi_url        = "https://github.com/straculencuandrei/coolSearch/releases/download/v$appVersion/$msiName"
        zip_url        = "https://github.com/straculencuandrei/coolSearch/releases/download/v$appVersion/coolSearch-v$appVersion-windows-x64.zip"
        published_at   = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        is_mandatory   = $false
    }

    $versionManifestJson = $versionManifest | ConvertTo-Json -Depth 4
    $versionManifestJson | Set-Content -Path $versionManifestPath -Encoding UTF8
    $versionManifestJson | Set-Content -Path (Join-Path $releaseDir "version_manifest.json") -Encoding UTF8

    return "Assembly complete."
}

try {
    Invoke-StepWithProgress -StepIndex 5 -TotalSteps $TOTAL_STEPS -Title "Release Artifacts Assembly & SHA256 Checksums" -Action $step5Action | Out-Null
} catch {
    Write-Host "`n  Fatal: $($_.Exception.Message)" -ForegroundColor Red
    Exit 1
}

$TotalStart.Stop()
$totalTime = Format-TimeSpan $TotalStart.Elapsed.TotalSeconds

# ========================================================
# RELEASE SUMMARY & ARTIFACTS TABLE
# ========================================================
Write-Host ""
Write-Host "  ================================================================" -ForegroundColor Green
Write-Host "    BUILD SUCCEEDED IN $totalTime! RELEASE ARTIFACTS READY        " -ForegroundColor Green
Write-Host "  ================================================================" -ForegroundColor Green
Write-Host ""

$releaseDir = Join-Path $ScriptDir "release"
$artifacts = Get-ChildItem -Path $releaseDir -File | Sort-Object Length -Descending

Write-Host "  Destination: $releaseDir" -ForegroundColor Cyan
Write-Host ""
Write-Host ("  {0,-42} {1,12} {2,18}" -f "Artifact File", "Size", "SHA256 (first 10)") -ForegroundColor DarkGray
Write-Host ("  {0,-42} {1,12} {2,18}" -f ("-" * 42), ("-" * 12), ("-" * 18)) -ForegroundColor DarkGray

foreach ($file in $artifacts) {
    $sizeMB = ($file.Length / 1MB).ToString("0.00") + " MB"
    if ($file.Length -lt 1MB) {
        $sizeMB = ($file.Length / 1KB).ToString("0.0") + " KB"
    }
    $hashShort = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash.Substring(0, 10).ToLower() + "..."
    Write-Host ("  {0,-42} {1,12} {2,18}" -f $file.Name, $sizeMB, $hashShort) -ForegroundColor White
}

Write-Host ""
Write-Host "  [+] All release assets packaged with SHA256 cryptographic signatures." -ForegroundColor Green
Write-Host "  [+] Ready for direct GitHub Release upload or local distribution." -ForegroundColor Cyan
Write-Host ""

if (-not $NoOpenFolder) {
    try {
        Start-Process explorer.exe -ArgumentList "`"$releaseDir`""
    } catch {}
}
