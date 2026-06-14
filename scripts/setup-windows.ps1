# QuickDesk - one-step installer for Windows.
#
# Right-click this file and choose "Run with PowerShell", or from a terminal:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
#
# Installs the QuickDesk agent, builds it, and registers it to start at login.

$ErrorActionPreference = "Stop"

$Root     = Split-Path -Parent $PSScriptRoot
$AgentDir = Join-Path $Root "desktop-agent"
$DataDir  = Join-Path $env:USERPROFILE ".quickdesk"
$TaskName = "QuickDeskAgent"

Write-Host ""
Write-Host "  QuickDesk - control your PC from your Apple Watch & iPhone" -ForegroundColor Cyan
Write-Host "  Installing the agent on this computer..." -ForegroundColor Gray
Write-Host ""

# --- Prerequisites ---------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js 18+ is required. Install it from https://nodejs.org and re-run." -ForegroundColor Yellow
  exit 1
}
$major = [int]((node -p "process.versions.node.split('.')[0]"))
if ($major -lt 18) {
  Write-Host "Node.js 18+ is required. Current: $(node -v)" -ForegroundColor Yellow
  exit 1
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# --- Build agent + UI ------------------------------------------------------
Write-Host "==> Installing dependencies..." -ForegroundColor Green
npm --prefix $AgentDir install

Write-Host "==> Building the agent (TypeScript -> dist)..." -ForegroundColor Green
npm --prefix $AgentDir run build

Write-Host "==> Building the control panel (UI)..." -ForegroundColor Green
npm --prefix (Join-Path $AgentDir "ui") install
npm --prefix (Join-Path $AgentDir "ui") run build

# --- Register a login task that keeps the agent running --------------------
Write-Host "==> Registering QuickDesk to start at login..." -ForegroundColor Green
$nodePath  = $node.Source
$indexPath = Join-Path $AgentDir "dist\index.js"

$action  = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$indexPath`"" -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "QuickDesk desktop agent" | Out-Null

# Start it now too.
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Done. Opening the control panel..." -ForegroundColor Cyan
Start-Process "http://127.0.0.1:7420/local"
Write-Host "If it doesn't open, browse to: http://127.0.0.1:7420/local"
Write-Host ""
