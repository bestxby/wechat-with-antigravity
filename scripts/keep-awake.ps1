# keep-awake.ps1
# This script prevents the Windows system from entering sleep mode while it is running.
# It does NOT simulate key presses. It uses the native SetThreadExecutionState API.

$code = @"
using System;
using System.Runtime.InteropServices;

public class Sleeper {
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int SetThreadExecutionState(int esFlags);
}
"@

# Compile the C# class into the PowerShell session
Add-Type -TypeDefinition $code

# Define flags:
# ES_CONTINUOUS (0x80000000) - Informs the system that the state being set should remain in effect until the next call that uses ES_CONTINUOUS and one of the other state flags is cleared.
# ES_SYSTEM_REQUIRED (0x00000001) - Forces the system to be in the working state by resetting the system idle timer.
$ES_CONTINUOUS = [int]0x80000000
$ES_SYSTEM_REQUIRED = 0x00000001

# Apply the flags
[Sleeper]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  WeChat-Antigravity Awake Mode Active" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "System sleep is now PREVENTED."
Write-Host "You will continue to receive WeChat messages 24/7."
Write-Host "Press Ctrl+C to exit and allow the system to sleep normally."
Write-Host ""

try {
    while ($true) {
        # Keep the script running forever
        Start-Sleep -Seconds 3600
    }
} finally {
    # If the script is interrupted, restore normal sleep behavior
    [Sleeper]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
    Write-Host "Awake Mode disabled. System can now sleep." -ForegroundColor Yellow
}
