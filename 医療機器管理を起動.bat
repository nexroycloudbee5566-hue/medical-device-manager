@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "launch-app.bat" (
  echo 起動に失敗しました。担当者に連絡してください。
  pause
  exit /b 1
)

echo.
echo   医療機器管理を起動しています…
echo   ブラウザが自動で開きます。
echo   終了するときはタスクバーの「医療機器管理」を閉じてください。
echo.

start "医療機器管理" /min "%ComSpec%" /c "cd /d "%~dp0" && call launch-app.bat"

exit /b 0