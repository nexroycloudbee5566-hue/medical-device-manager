# 開発サーバー起動（別ウィンドウ）→ ポート待ち → 既定ブラウザで開く

$Host.UI.RawUI.OutputEncoding = [System.Text.UTF8Encoding]::new()
Set-StrictMode -Off
Set-Location -LiteralPath $PSScriptRoot

function Test-TcpOpen {
    param([string]$Hostname, [int]$Port, [int]$TimeoutMs)
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $iar = $client.BeginConnect($Hostname, $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            return $false
        }
        try {
            $client.EndConnect($iar)
            return $true
        }
        catch {
            return $false
        }
    }
    finally {
        try { $client.Close() } catch { }
        try { $client.Dispose() } catch { }
    }
}

Write-Host ''
Write-Host '--- 医療機器管理 Web アプリ を起動します ---' -ForegroundColor Cyan
Write-Host "フォルダ: $PSScriptRoot"
Write-Host ''

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host '[エラー] npm が見つかりません。' -ForegroundColor Red
    Write-Host '  Node.js LTS をインストール後、再起動または PATH を確認してください。'
    Read-Host "`nEnter で閉じます"
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Host '[エラー] node_modules がありません。' -ForegroundColor Red
    Write-Host '  このフォルダでコマンドプロンプトまたは PowerShell を開き:'
    Write-Host '    npm install'
    Write-Host '  を実行してから、この起動ファイルを開き直してください。'
    Read-Host "`nEnter で閉じます"
    exit 1
}

$port = 3000
# ログイン画面を直接開く（`/auth` 誤入力で出る純404を避ける。ログイン済みなら自動でダッシュボードへ）
$openUrl = "http://127.0.0.1:${port}/auth/login"

Write-Host '別ウィンドウで「npm run dev」を開始します…' -ForegroundColor Yellow
Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/k', "cd /d `"$PSScriptRoot`" && echo Next.js を起動しています...&& npm run dev" `
    -WorkingDirectory $PSScriptRoot

Write-Host "`nポート $port が開くまで最大 2 分待ちます。"
Write-Host "開かない場合は、開いた別ウィンドウにエラー（赤字）が出ていないか確認してください。`n"

$opened = $false
for ($i = 0; $i -lt 120; $i++) {
    foreach ($h in @('127.0.0.1', 'localhost')) {
        if (Test-TcpOpen -Hostname $h -Port $port -TimeoutMs 900) {
            Write-Host "`n準備できました。ブラウザで $openUrl を開きます。`n" -ForegroundColor Green
            Start-Process $openUrl
            $opened = $true
            break
        }
    }
    if ($opened) { break }
    if (($i % 10) -eq 0 -and $i -gt 0) {
        Write-Host ("  … {0} 秒経過" -f $i)
    }
    Start-Sleep -Seconds 1
}

if (-not $opened) {
    Write-Host "`nタイムアウト: サーバーがポートに応答しませんでした。" -ForegroundColor Yellow
    Write-Host ' とりあえずブラウザを開き試します:'
    Write-Host ('   {0}' -f $openUrl)
    try { Start-Process $openUrl } catch { }
    Write-Host "`n開発サーバー用ウィンドウの URL とポートを確認してください。"
}

Read-Host "`nこのウィンドウは Enter で閉じられます"

