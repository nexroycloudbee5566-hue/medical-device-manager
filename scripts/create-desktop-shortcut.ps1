# デスクトップに「医療機器管理を起動」ショートカットを作成（担当者用）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root '医療機器管理を起動.vbs'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop '医療機器管理を起動.lnk'

if (-not (Test-Path -LiteralPath $target)) {
  Write-Host "見つかりません: $target"
  exit 1
}

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = $target
$sc.WorkingDirectory = $root
$sc.WindowStyle = 1
$sc.Description = '医療機器管理システムを起動'
$sc.Save()

Write-Host "作成しました: $lnk"