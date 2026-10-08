$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$targetExe = Join-Path $ScriptDir "coolSearch.exe"

if (-not (Test-Path $targetExe)) {
    $alt = Join-Path $ScriptDir "release\coolSearch.exe"
    if (Test-Path $alt) { $targetExe = $alt }
}

$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $DesktopPath "coolSearch.lnk"

$Shortcut = $WshShell.CreateShortcut($lnkPath)
$Shortcut.TargetPath = $targetExe
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "coolSearch - Ultra-Fast NTFS Search"
$Shortcut.IconLocation = "$targetExe,0"
$Shortcut.Save()

# Set 'Run as Administrator' flag (bit 0x20 at offset 0x15 in .lnk file)
try {
    $bytes = [System.IO.File]::ReadAllBytes($lnkPath)
    $bytes[0x15] = $bytes[0x15] -bor 0x20
    [System.IO.File]::WriteAllBytes($lnkPath, $bytes)
} catch {}

Write-Host "Desktop shortcut created successfully at: $lnkPath" -ForegroundColor Green
