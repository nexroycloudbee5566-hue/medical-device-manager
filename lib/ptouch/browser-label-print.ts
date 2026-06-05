import JsBarcode from 'jsbarcode'

export type MeLabelPrintRow = {
  meNo: string
  /** 台帳の機種名（devices.name） */
  deviceName?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function barcodeSvg(meNo: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, meNo, {
    format: 'CODE128',
    width: 2,
    height: 56,
    displayValue: true,
    fontSize: 14,
    margin: 4,
  })
  return new XMLSerializer().serializeToString(svg)
}

/** ブラウザの印刷ダイアログ（P-touch ドライバー選択可） */
export function printMeLabelsInBrowser(
  rows: MeLabelPrintRow[],
  copies = 1,
): { ok: true } | { ok: false; error: string } {
  if (rows.length === 0) {
    return { ok: false, error: '印刷する機器がありません。' }
  }

  const invalid = rows.find((r) => !r.meNo.trim())
  if (invalid) {
    return { ok: false, error: 'ME No. が未設定の機器が含まれています。' }
  }

  const labels: string[] = []
  for (const row of rows) {
    for (let c = 0; c < copies; c++) {
      const meNo = row.meNo.trim()
      const modelName = row.deviceName?.trim() ?? ''
      labels.push(`
        <div class="label">
          ${barcodeSvg(meNo)}
          ${modelName ? `<p class="sub">${escapeHtml(modelName)}</p>` : ''}
        </div>
      `)
    }
  }

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>ME No. ラベル</title>
  <style>
    @page { size: 62mm 29mm; margin: 2mm; }
    body { margin: 0; font-family: sans-serif; }
    .label {
      width: 58mm;
      min-height: 24mm;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .label:last-child { page-break-after: auto; }
    .label svg { max-width: 100%; height: auto; }
    .sub {
      margin: 2px 0 0;
      font-size: 9px;
      line-height: 1.2;
      max-width: 58mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>${labels.join('')}</body>
</html>`

  const win = window.open('', '_blank', 'width=480,height=640')
  if (!win) {
    return { ok: false, error: 'ポップアップがブロックされました。ブラウザでポップアップを許可してください。' }
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  win.onload = () => {
    win.print()
  }
  setTimeout(() => {
    try {
      win.print()
    } catch {
      /* ignore */
    }
  }, 400)

  return { ok: true }
}
