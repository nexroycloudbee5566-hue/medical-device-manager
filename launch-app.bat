@echo off
chcp 65001 >nul
title 医療機器管理システム
cd /d "%~dp0"

echo.
echo ========================================
echo   医療機器管理システム を起動します
echo ========================================
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

echo 準備ができたらブラウザでアプリを開きます。
echo データは Supabase クラウドと同期します（他 PC と共有）。
echo 詳細: docs\ローカル利用ガイド.md
echo.
echo ※ この黒い画面を閉じるとアプリは停止します。
echo    止めるときはこの画面で Ctrl + C を押すか、右上の × で閉じてください。
echo.

start "" cmd /c "timeout /t 8 /nobreak >nul & start http://127.0.0.1:3000/"

call npm run dev

echo.
echo アプリは停止しました。
pause
