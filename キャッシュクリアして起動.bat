@echo off
chcp 65001 >nul
title 医療機器管理 — キャッシュクリア起動
cd /d "%~dp0"

echo.
echo 古いビルドキャッシュ .next を削除してから起動します...
echo.

if exist ".next\" (
  rmdir /s /q ".next"
  if exist ".next\" (
    echo [エラー] .next を削除できません。npm run dev を止めてからもう一度実行してください。
    pause
    exit /b 1
  )
  echo キャッシュを削除しました。
) else (
  echo .next はありません（そのまま起動します）。
)

echo.
call "%~dp0起動.bat"