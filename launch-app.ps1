# Compatibility wrapper. Double-click 起動.bat (or launch-app.bat).
Set-Location -LiteralPath $PSScriptRoot
cmd.exe /c "`"$PSScriptRoot\launch-app.bat`""
