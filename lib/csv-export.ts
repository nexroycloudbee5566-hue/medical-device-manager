/** CSVセル用エスケープ（Excel互換・UTF-8 BOM付きダウンロード） */
export function escapeCsvCell(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',')
  const body = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
  return `${headerLine}\r\n${body}`
}

/** ブラウザから CSV を保存（Excel で文字化けしにくい UTF-8 BOM） */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function csvFilename(prefix: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${prefix}_${y}-${m}-${day}.csv`
}
