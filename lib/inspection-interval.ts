import { addMonths, format, parse, startOfDay, isValid } from 'date-fns'
import type { MaintenanceModelMaster } from '@/lib/types'
import { matchMasterForDevice } from '@/lib/maintenance-master'

export const DEFAULT_INSPECTION_INTERVAL_MONTHS = 12

/** 型式マスタで選べる点検期間（月） */
export const INSPECTION_INTERVAL_OPTIONS: { months: number; label: string }[] = [
  { months: 3, label: '3ヶ月（四半期）' },
  { months: 6, label: '6ヶ月（半期）' },
  { months: 12, label: '12ヶ月（1年）' },
  { months: 18, label: '18ヶ月' },
  { months: 24, label: '24ヶ月（2年）' },
  { months: 36, label: '36ヶ月（3年）' },
]

export function normalizeIntervalMonths(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_INSPECTION_INTERVAL_MONTHS
  return Math.min(120, Math.round(n))
}

export function intervalMonthsLabel(months: number): string {
  const opt = INSPECTION_INTERVAL_OPTIONS.find((o) => o.months === months)
  if (opt) return opt.label
  return `${months}ヶ月`
}

export function getIntervalMonthsForDevice(
  masters: MaintenanceModelMaster[],
  manufacturer: string | null | undefined,
  model: string | null | undefined,
): number {
  const m = matchMasterForDevice(masters, manufacturer, model)
  return normalizeIntervalMonths(m?.inspection_interval_months)
}

function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = parse(s.slice(0, 10), 'yyyy-MM-dd', new Date())
  return isValid(d) ? startOfDay(d) : null
}

/** 実施日から次回点検予定日（yyyy-MM-dd） */
export function nextDueFromCompletedDate(
  completedDate: string,
  intervalMonths: number,
): string {
  const base = parseYmd(completedDate) ?? startOfDay(new Date())
  return format(addMonths(base, normalizeIntervalMonths(intervalMonths)), 'yyyy-MM-dd')
}

/** 次回予定: 台帳の next_maintenance_due を優先、なければ最終点検 + 点検期間 */
export function derivePlannedDate(
  nextMaintenanceDue: string | null | undefined,
  lastCompletedDate: string | null | undefined,
  intervalMonths = DEFAULT_INSPECTION_INTERVAL_MONTHS,
): string | null {
  const fromDue = parseYmd(nextMaintenanceDue ?? null)
  if (fromDue) return format(fromDue, 'yyyy-MM-dd')

  const last = parseYmd(lastCompletedDate ?? null)
  if (last) {
    return format(addMonths(last, normalizeIntervalMonths(intervalMonths)), 'yyyy-MM-dd')
  }

  return null
}

/** 点検期限日（最終点検 + 期間）。未点検は null */
export function inspectionDueDate(
  lastCompletedDate: string | null | undefined,
  intervalMonths: number,
): string | null {
  const last = parseYmd(lastCompletedDate ?? null)
  if (!last) return null
  return format(addMonths(last, normalizeIntervalMonths(intervalMonths)), 'yyyy-MM-dd')
}

/** 点検期限を過ぎている、または一度も点検していない */
export function isInspectionStale(
  lastCompletedDate: string | null | undefined,
  intervalMonths: number,
  today = new Date(),
): boolean {
  if (!lastCompletedDate) return true
  const due = parseYmd(inspectionDueDate(lastCompletedDate, intervalMonths))
  if (!due) return true
  return startOfDay(today) >= due
}
