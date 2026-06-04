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

/** Excelの列ラベル → 内部フィールド名（温泉HP機器台帳フォーマット・シート1） */
const FIELD_BY_HEADER_KEY: Record<string, keyof ExcelRawFields> = {
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
  [hk('メンテナンス\n （契約）')]: 'maintenance_contract',
  [hk('メンテナンス(契約)')]: 'maintenance_contract',
  [hk('区別\n （自設・リース）')]: 'ownership_type',
  [hk('区別(自設・リース)')]: 'ownership_type',
  [hk('ステータス')]: 'excel_status',
  [hk('棚卸確認')]: 'inventory_confirmation',
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
  maintenance_contract: unknown
  ownership_type: unknown
  excel_status: unknown
  inventory_confirmation: unknown
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
  maintenance_contract: string | null
  ownership_type: string | null
  inventory_confirmation: string | null
  status: DeviceStatus
}

export function mapExcelEquipmentStatus(v: unknown): DeviceStatus {
  const s = String(v ?? '').trim()
  if (s === '修理中') return 'repair'
  if (s === '廃棄') return 'inactive'
  return 'active'
}

/** Excel日付シリアルまたは ISO 文字列 → yyyy-MM-dd */
export function excelCellToIsoDate(v: unknown): string | null {
  if (v === '' || v == null) return null
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return null
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
    const n = Number(t)
    if (!Number.isFinite(n)) return null
    return excelSerialToIsoDateNumber(n)
  }
  if (typeof v === 'number' && Number.isFinite(v)) return excelSerialToIsoDateNumber(v)
  return null
}

function excelSerialToIsoDateNumber(serial: number): string | null {
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
    manufacture_year_month: str(f.manufacture_year_month),
    purchase_date: excelCellToIsoDate(f.purchase_date_raw),
    manufacturer: str(f.manufacturer),
    dealer: str(f.dealer),
    notes: str(f.notes),
    maintenance_contract: str(f.maintenance_contract),
    ownership_type: str(f.ownership_type),
    inventory_confirmation: str(f.inventory_confirmation),
    status: mapExcelEquipmentStatus(f.excel_status),
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

/** Supabase upsert 用の行（Excelと同一項目） */
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
    maintenance_contract: r.maintenance_contract,
    ownership_type: r.ownership_type,
    inventory_confirmation: r.inventory_confirmation,
    status: r.status,
    updated_at: new Date().toISOString(),
  }
}
