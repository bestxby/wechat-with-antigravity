$api = '[DllImport("user32.dll")] public static extern void LockWorkStation();'
Add-Type -MemberDefinition $api -Name "LockScreen" -Namespace "WinAPI"
[WinAPI.LockScreen]::LockWorkStation()
