$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
if (-not $cpu) {
    $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
}
if (-not $cpu) { $cpu = 0 }
$cpu = [Math]::Round($cpu, 1)

$os = Get-CimInstance Win32_OperatingSystem
$totalMemGB = [Math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$freeMemGB = [Math]::Round($os.FreePhysicalMemory / 1MB, 1)
$usedMemGB = [Math]::Round($totalMemGB - $freeMemGB, 1)
$memPercent = [Math]::Round(($usedMemGB / $totalMemGB) * 100, 1)

Write-Output "System Health Status"
Write-Output "CPU: $cpu%"
Write-Output "MemoryUsed: $usedMemGB GB"
Write-Output "MemoryTotal: $totalMemGB GB"
Write-Output "MemoryPercent: $memPercent%"

Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | ForEach-Object {
    $sizeGB = [Math]::Round($_.Size / 1GB, 1)
    $freeGB = [Math]::Round($_.FreeSpace / 1GB, 1)
    $usedGB = [Math]::Round($sizeGB - $freeGB, 1)
    $percent = [Math]::Round(($usedGB / $sizeGB) * 100, 1)
    Write-Output "Disk $($_.DeviceID) Size: $($sizeGB)GB | Used: $($usedGB)GB ($percent%) | Free: $($freeGB)GB"
}

$uptime = (Get-Date) - $os.LastBootUpTime
$uptimeStr = "$($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m"
Write-Output "Uptime: $uptimeStr"
