import * as XLSX from 'xlsx'
import type { DeviceStatus } from '@/lib/types'

/** 見出し行の改行・空白を除いてキー照合 */
export function normalizeDeviceExcelHeader(header: string): string {
  return header
    .replace(/\r?\n/g, '')
    .replace(/\s/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
}

function hk(s: string): string {
  return normalizeDeviceExcelHeader(s)
}

/** Excelの列ラベル → 内部フィールド名（榊原温泉病院 医療機器台帳 完成版・シート1） */
const FIELD_BY_HEADER_KEY: Record<string, keyof ExcelRawFields> = {
  [hk('MENo.')]: 'barcode',
  [hk('ME No.')]: 'barcode',
  [hk('新No.')]: 'barcode',
  [hk('設置場所')]: 'location',
  [hk('機器区分')]: 'equipment_category',
  [hk('特定\n 保守')]: 'specific_maintenance',
  [hk('特定保守')]: 'specific_maintenance',
  [hk('管理区分')]: 'management_category',
  [hk('機種名')]: 'name',
  [hk('型式')]: 'model',
  [hk('製造番号')]: 'serial_number',
  [hk('製造年月')]: 'manufacture_year_month',
  [hk('購入年月')]: 'purchase_date_raw',
  [hk('製造元メーカー')]: 'manufacturer',
  [hk('販売ディーラー')]: 'dealer',
  [hk('備考')]: 'notes',
  [hk('ステータス')]: 'excel_status',
}

type ExcelRawFields = {
  barcode: unknown
  location: unknown
  equipment_category: unknown
  specific_maintenance: unknown
  management_category: unknown
  name: unknown
  model: unknown
  serial_number: unknown
  manufacture_year_month: unknown
  purchase_date_raw: unknown
  manufacturer: unknown
  dealer: unknown
  notes: unknown
  excel_status: unknown
}

export type ExcelDeviceImportRow = {
  barcode: string
  name: string
  location: string | null
  equipment_category: string | null
  specific_maintenance: string | null
  management_category: string | null
  model: string | null
  serial_number: string | null
  manufacture_year_month: string | null
  purchase_date: string | null
  manufacturer: string | null
  dealer: string | null
  notes: string | null
  status: DeviceStatus
  /** Excel のステータス原文（利用中・廃棄・移動など） */
  excelStatusLabel: string | null
}

/** 榊原温泉病院台帳のステータス → アプリの device.status */
export function mapExcelEquipmentStatus(v: unknown): DeviceStatus {
  const s = String(v ?? '').trim()
  if (s === '利用中') return 'active'
  if (s === '移動') return 'moved'
  if (s === '廃棄' || s === '破棄') return 'disposed'
  if (s === '修理中') return 'repair'
  if (s === '') return 'active'
  return 'unknown'
}

/** Excel日付シリアルまたは ISO / 年月文字列 → yyyy-MM-dd（購入年月用） */
export function excelCellToIsoDate(v: unknown): string | null {
  if (v === '' || v == null) return null
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return null
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
    const ym = t.match(/^(\d{4})[\/年.-](\d{1,2})/)
    if (ym) {
      const month = ym[2].padStart(2, '0')
      return `${ym[1]}-${month}-01`
    }
    const n = Number(t)
    if (!Number.isFinite(n)) return null
    return excelSerialToIsoDateNumber(n)
  }
  if (typeof v === 'number' && Number.isFinite(v)) return excelSerialToIsoDateNumber(v)
  return null
}

function excelSerialToIsoDateNumber(serial: number): string | null {
  if (serial < 1000) return null
  const utc_days = Math.floor(serial - 25569)
  const utc_ms = utc_days * 86400 * 1000
  const d = new Date(utc_ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function str(v: unknown): string | null {
  if (v === '' || v == null) return null
  const s = String(v).trim()
  return s || null
}

function formatManufactureYearMonth(v: unknown): string | null {
  if (v === '' || v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    const iso = excelSerialToIsoDateNumber(v)
    if (iso) return iso.slice(0, 7).replace('-', '/')
  }
  const s = String(v).trim()
  return s || null
}

function collectExcelFields(raw: Record<string, unknown>): Partial<ExcelRawFields> {
  const acc: Partial<ExcelRawFields> = {}
  for (const [header, val] of Object.entries(raw)) {
    const key = FIELD_BY_HEADER_KEY[normalizeDeviceExcelHeader(header)]
    if (key) acc[key] = val
  }
  return acc
}

export function parseExcelRowToDevice(row: Record<string, unknown>): ExcelDeviceImportRow | null {
  const f = collectExcelFields(row)
  const barcode = str(f.barcode)
  const name = str(f.name)
  if (!barcode || !name) return null

  const excelStatusLabel = str(f.excel_status)

  return {
    barcode,
    name,
    location: str(f.location),
    equipment_category: str(f.equipment_category),
    specific_maintenance: str(f.specific_maintenance),
    management_category: str(f.management_category),
    model: str(f.model),
    serial_number:
      f.serial_number === '' || f.serial_number == null
        ? null
        : String(f.serial_number).trim(),
    manufacture_year_month: formatManufactureYearMonth(f.manufacture_year_month),
    purchase_date: excelCellToIsoDate(f.purchase_date_raw),
    manufacturer: str(f.manufacturer),
    dealer: str(f.dealer),
    notes: str(f.notes),
    status: mapExcelEquipmentStatus(f.excel_status),
    excelStatusLabel,
  }
}

export function parseDeviceRegistryWorkbook(wb: XLSX.WorkBook): ExcelDeviceImportRow[] {
  const sheetName = wb.SheetNames.includes('シート1')
    ? 'シート1'
    : wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const out: ExcelDeviceImportRow[] = []
  for (const row of rows) {
    const parsed = parseExcelRowToDevice(row)
    if (parsed) out.push(parsed)
  }
  return out
}

export function workbookFromArrayBuffer(buf: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buf, { type: 'array' })
}

/** Supabase upsert 用の行 */
export function excelImportRowToDeviceInsert(r: ExcelDeviceImportRow): Record<string, unknown> {
  return {
    barcode: r.barcode,
    name: r.name,
    location: r.location,
    equipment_category: r.equipment_category,
    specific_maintenance: r.specific_maintenance,
    management_category: r.management_category,
    model: r.model,
    serial_number: r.serial_number,
    manufacture_year_month: r.manufacture_year_month,
    purchase_date: r.purchase_date,
    manufacturer: r.manufacturer,
    dealer: r.dealer,
    notes: r.notes,
    status: r.status,
    updated_at: new Date().toISOString(),
  }
}

/** 台帳 Excel の必須列が含まれるか（取込前の簡易チェック） */
export function detectDeviceRegistrySheet(wb: XLSX.WorkBook): boolean {
  const sheetName = wb.SheetNames.includes('シート1') ? 'シート1' : wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
  const headerRow = matrix[0]
  if (!headerRow?.length) return false
  const headers = headerRow.map((c) => normalizeDeviceExcelHeader(String(c)))
  const hasId = headers.some((h) => h === hk('MENo.') || h === hk('ME No.') || h === hk('新No.'))
  const hasName = headers.includes(hk('機種名'))
  return hasId && hasName
}
