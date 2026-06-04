@echo off
REM 開発サーバー + ブラウザ起動（実処理は launch-app.ps1）

cd /d "%~dp0"

set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" (
    echo [エラー] PowerShell が見つかりません (%POWERSHELL_EXE%)
    pause
    exit /b 1
)

echo 医療機器管理 アプリ を起動します...
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-app.ps1"
exit /b %ERRORLEVEL%
