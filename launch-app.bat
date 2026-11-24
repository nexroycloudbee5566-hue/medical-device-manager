@echo off
chcp 65001 >nul
title 医療機器管理システム
cd /d "%~dp0"

echo.
echo   医療機器管理システム（起動中）
echo   閉じるとアプリは停止します。
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [エラー] Node.js が入っていません。
  echo https://nodejs.org/ から LTS をインストールし、
  echo この画面を閉じてから、もう一度 起動.bat を開いてください。
  echo.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo [エラー] 接続設定ファイル .env.local がありません。
  echo 今使っている PC から .env.local を、このフォルダにコピーしてください。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 初回セットアップ中です。数分かかることがあります...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [エラー] セットアップに失敗しました。
    pause
    exit /b 1
  )
  echo.
)

echo ブラウザを開きます…
echo.

start "" cmd /c "timeout /t 6 /nobreak >nul & start http://127.0.0.1:3000/auth/login"

call npm run dev
exit /b %ERRORLEVEL%
