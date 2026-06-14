$api = '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
Add-Type -MemberDefinition $api -Name "DpiAware" -Namespace "WinAPI"
[WinAPI.DpiAware]::SetProcessDPIAware()

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Screen = [System.Windows.Forms.Screen]::PrimaryScreen
$Width = $Screen.Bounds.Width
$Height = $Screen.Bounds.Height
$Bitmap = New-Object System.Drawing.Bitmap $Width, $Height
$Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
$Graphics.CopyFromScreen($Screen.Bounds.X, $Screen.Bounds.Y, 0, 0, $Bitmap.Size)
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.wechat-agent\screenshot.png"))
$Bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$Graphics.Dispose()
$Bitmap.Dispose()
Write-Output "Screenshot saved to $outputPath (Size: ${Width}x${Height})"
