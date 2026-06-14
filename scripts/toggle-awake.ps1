$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$proc = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*keep-awake.ps1*" -and $_.ProcessId -ne $PID }

if ($proc) {
    foreach ($p in $proc) {
        Stop-Process -Id $p.ProcessId -Force
    }
    Write-Output "OFF"
} else {
    $scriptPath = Join-Path $PSScriptRoot "keep-awake.ps1"
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -WindowStyle Hidden
    Write-Output "ON"
}
