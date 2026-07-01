import { addMonths, format, parse, startOfDay, isValid } from 'date-fns'
import type { MaintenanceModelMaster } from '@/lib/types'
import { matchMasterForDevice } from '@/lib/maintenance-master'

export const DEFAULT_INSPECTION_INTERVAL_MONTHS = 12

/** 型式マスタで選べる点検期間（月） */
export const INSPECTION_INTERVAL_OPTIONS: { months: number; label: string }[] = [
  { months: 1, label: '1ヶ月（毎月）' },
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
  const m = matchMasterForDevice(masters, manufacturer, model, 'periodic')
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

/** 指定年に含まれる定期点検予定日（点検期間に基づき複数生成） */
export function generatePlannedDatesInYear(
  lastCompletedDate: string | null | undefined,
  nextMaintenanceDue: string | null | undefined,
  intervalMonths: number,
  year: number,
): string[] {
  const interval = normalizeIntervalMonths(intervalMonths)
  const yearStart = startOfDay(new Date(year, 0, 1))
  const yearEnd = startOfDay(new Date(year, 11, 31))

  const last = parseYmd(lastCompletedDate ?? null)
  const dueFromLedger = parseYmd(nextMaintenanceDue ?? null)

  if (!last && !dueFromLedger) return []

  let seed: Date = last
    ? addMonths(last, interval)
    : dueFromLedger!

  while (seed > yearEnd) {
    seed = addMonths(seed, -interval)
  }
  while (true) {
    const prev = addMonths(seed, -interval)
    if (prev < yearStart) break
    seed = prev
  }

  const results: string[] = []
  let cursor: Date = seed
  while (cursor <= yearEnd) {
    if (cursor >= yearStart) {
      results.push(format(cursor, 'yyyy-MM-dd'))
    }
    cursor = addMonths(cursor, interval)
  }
  return results
}

/** 予定月に点検完了があるか */
export function isOccurrenceCompleted(
  plannedDate: string,
  completionDates: string[],
): boolean {
  const planned = parseYmd(plannedDate)
  if (!planned) return false
  return completionDates.some((cd) => {
    const completed = parseYmd(cd)
    if (!completed) return false
    return (
      completed.getFullYear() === planned.getFullYear() &&
      completed.getMonth() === planned.getMonth()
    )
  })
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

function parseYmdLocal(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = parse(s.slice(0, 10), 'yyyy-MM-dd', new Date())
  return isValid(d) ? startOfDay(d) : null
}

/** 年月のみ比較（a の年月 − b の年月。例: 2025/3 vs 2025/1 → 2） */
export function compareYearMonth(a: Date, b: Date): number {
  return a.getFullYear() * 12 + a.getMonth() - (b.getFullYear() * 12 + b.getMonth())
}

/** 点検予定月を過ぎているか（予定と同じ月は未超過） */
export function isDueMonthPast(due: Date, ref: Date): boolean {
  return compareYearMonth(ref, due) > 0
}

/** 予定月から何ヶ月超過しているか（予定月・未来は 0） */
export function monthsPastDue(due: Date, ref: Date): number {
  const diff = compareYearMonth(ref, due)
  return diff > 0 ? diff : 0
}

/** 次回点検予定日が月単位で期限超過か */
export function isMaintenanceDueOverdue(
  nextMaintenanceDue: string | null | undefined,
  today = new Date(),
): boolean {
  const due = parseYmdLocal(nextMaintenanceDue)
  if (!due) return false
  return isDueMonthPast(due, startOfDay(today))
}

/** 超過月数の表示用（超過なしは null） */
export function formatMonthsPastDueLabel(
  dueYmd: string | null | undefined,
  today = new Date(),
): string | null {
  const due = parseYmdLocal(dueYmd)
  if (!due) return null
  const months = monthsPastDue(due, startOfDay(today))
  if (months <= 0) return null
  return `${months}ヶ月超過`
}

/** 予定日が指定日と同じ年月か */
export function isPlannedInMonth(plannedDate: string | null | undefined, ref: Date): boolean {
  const d = parseYmdLocal(plannedDate)
  if (!d) return false
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}

/** その月に定期点検完了済みか */
export function completedInspectionInMonth(
  lastCompletedDate: string | null | undefined,
  ref: Date,
): boolean {
  const d = parseYmdLocal(lastCompletedDate)
  if (!d) return false
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}

/** 点検期限月を過ぎている、または計画未設定（日ではなく月単位） */
export function isInspectionStale(
  lastCompletedDate: string | null | undefined,
  intervalMonths: number,
  nextMaintenanceDue?: string | null,
  today = new Date(),
): boolean {
  const todayStart = startOfDay(today)
  const fromDue = parseYmd(nextMaintenanceDue ?? null)

  if (!lastCompletedDate) {
    if (fromDue && !isDueMonthPast(fromDue, todayStart)) return false
    return true
  }

  const due =
    fromDue ?? parseYmd(inspectionDueDate(lastCompletedDate, intervalMonths))
  if (!due) return true
  return isDueMonthPast(due, todayStart)
}
