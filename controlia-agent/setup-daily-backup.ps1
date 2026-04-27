#Requires -RunAsAdministrator
<#
  Creates a Windows Scheduled Task to run the ControlIA database backup daily at 02:00.

  Usage:
    1. Open PowerShell as Administrator
    2. cd "C:\Users\LENOVO CORP\ControlIA SaaS\controlia-agent"
    3. .\setup-daily-backup.ps1
#>

$taskName = "ControlIA-DailyBackup"
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"cd '$projectPath'; npm run backup`""
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task: $taskName"
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "✅ Scheduled task '$taskName' created successfully."
Write-Host "   Runs daily at 02:00 from: $projectPath"
Write-Host "   Command: npm run backup"
Write-Host ""
Write-Host "To verify: Get-ScheduledTask -TaskName '$taskName'"
Write-Host "To run now: Start-ScheduledTask -TaskName '$taskName'"
Write-Host "To remove:  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
