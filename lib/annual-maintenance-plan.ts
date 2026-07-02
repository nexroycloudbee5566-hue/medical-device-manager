import { format, parse, startOfDay, isValid } from 'date-fns'
import type { Device, MaintenanceModelMaster } from '@/lib/types'
import { normalizeDeviceStatus } from '@/lib/types'
import { filterPeriodicMasters, matchMasterForDevice } from '@/lib/maintenance-master'
import {
  compareYearMonth,
  completedInspectionInMonth,
  deriveDisplayPlannedDate,
  getIntervalMonthsForDevice,
  isInspectionStale,
} from '@/lib/inspection-interval'

/** 年間計画の対象: 利用中かつメンテナンスマスタ（型式）が登録されている機器 */
export function deviceEligibleForAnnualPlan(
  masters: MaintenanceModelMaster[],
  dev: Pick<{ manufacturer?: string | null; model?: string | null; status?: string }, 'manufacturer' | 'model' | 'status'>,
): boolean {
  if (normalizeDeviceStatus(dev.status) !== 'active') return false
  const periodic = filterPeriodicMasters(masters)
  return matchMasterForDevice(periodic, dev.manufacturer, dev.model, 'periodic') != null
}

export type AnnualPlanStatus =
  | 'completed'
  | 'overdue'
  | 'due_this_month'
  | 'scheduled'
  | 'unscheduled'

export interface AnnualPlanItem {
  deviceId: string
  name: string
  barcode: string | null
  manufacturer: string | null
  model: string | null
  department: string | null
  location: string | null
  hospitalName: string | null
  /** 次回点検予定日（yyyy-MM-dd） */
  plannedDate: string | null
  /** 直近の定期点検完了日 */
  lastCompletedDate: string | null
  /** 選択年のうちに定期点検完了済み */
  completedInYear: boolean
  status: AnnualPlanStatus
}

export interface AnnualPlanMonthGroup {
  month: number
  label: string
  items: AnnualPlanItem[]
}

function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = parse(s.slice(0, 10), 'yyyy-MM-dd', new Date())
  return isValid(d) ? startOfDay(d) : null
}

function statusForItem(
  plannedDate: string | null,
  lastCompletedDate: string | null,
  isStale: boolean,
  today: Date,
): AnnualPlanStatus {
  const planned = parseYmd(plannedDate)
  if (!planned) return 'unscheduled'
  if (completedInspectionInMonth(lastCompletedDate, planned)) return 'completed'
  if (isStale) return 'overdue'
  const now = startOfDay(today)
  const monthCmp = compareYearMonth(planned, now)
  if (monthCmp < 0) return 'overdue'
  if (monthCmp === 0) return 'due_this_month'
  return 'scheduled'
}

export function buildAnnualPlanItems(
  devices: Device[],
  masters: MaintenanceModelMaster[],
  latestInspectionByDevice: Map<string, string>,
  completedInYearByDevice: Set<string>,
  year: number,
  today = new Date(),
): AnnualPlanItem[] {
  const todayStart = startOfDay(today)
  const items: AnnualPlanItem[] = []

  for (const dev of devices) {
    if (!deviceEligibleForAnnualPlan(masters, dev)) continue

    const lastCompleted = latestInspectionByDevice.get(dev.id) ?? null
    const intervalMonths = getIntervalMonthsForDevice(masters, dev.manufacturer, dev.model)
    const plannedDate = deriveDisplayPlannedDate(
      dev.next_maintenance_due,
      lastCompleted,
      intervalMonths,
      todayStart,
    )
    const isStale = isInspectionStale(
      lastCompleted,
      intervalMonths,
      dev.next_maintenance_due,
      todayStart,
    )
    const completedInYear = completedInYearByDevice.has(dev.id)

    items.push({
      deviceId: dev.id,
      name: dev.name,
      barcode: dev.barcode,
      manufacturer: dev.manufacturer,
      model: dev.model,
      department: dev.department,
      location: dev.location,
      hospitalName: dev.hospitals?.name ?? null,
      plannedDate,
      lastCompletedDate: lastCompleted,
      completedInYear,
      status: statusForItem(plannedDate, lastCompleted, isStale, todayStart),
    })
  }

  items.sort((a, b) => {
    const ad = a.plannedDate ?? '9999-12-31'
    const bd = b.plannedDate ?? '9999-12-31'
    if (ad !== bd) return ad.localeCompare(bd)
    return a.name.localeCompare(b.name, 'ja')
  })

  return items
}

export type FutureYearPlanGroup = {
  year: number
  label: string
  items: AnnualPlanItem[]
}

export function groupPlanByMonth(
  items: AnnualPlanItem[],
  year: number,
): {
  overdue: AnnualPlanItem[]
  months: AnnualPlanMonthGroup[]
  unscheduled: AnnualPlanItem[]
  /** 表示年より後の予定（12月に混ぜない） */
  futureYears: FutureYearPlanGroup[]
} {
  const overdue: AnnualPlanItem[] = []
  const unscheduled: AnnualPlanItem[] = []
  const byMonth = new Map<number, AnnualPlanItem[]>()
  const futureByYear = new Map<number, AnnualPlanItem[]>()

  for (let m = 1; m <= 12; m++) {
    byMonth.set(m, [])
  }

  for (const item of items) {
    if (!item.plannedDate) {
      if (!item.completedInYear) unscheduled.push(item)
      continue
    }

    const planned = parseYmd(item.plannedDate)
    if (!planned) {
      if (!item.completedInYear) unscheduled.push(item)
      continue
    }

    const plannedYear = planned.getFullYear()

    if (plannedYear < year && !item.completedInYear && item.status !== 'completed') {
      overdue.push(item)
      continue
    }

    if (plannedYear > year && !item.completedInYear && item.status !== 'completed') {
      if (!futureByYear.has(plannedYear)) futureByYear.set(plannedYear, [])
      futureByYear.get(plannedYear)!.push(item)
      continue
    }

    if (plannedYear === year) {
      byMonth.get(planned.getMonth() + 1)!.push(item)
      if (item.status === 'overdue') {
        overdue.push(item)
      }
      continue
    }

    if (!item.completedInYear) unscheduled.push(item)
  }

  const monthLabels = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月',
  ]

  const months: AnnualPlanMonthGroup[] = monthLabels.map((label, i) => {
    const month = i + 1
    const list = byMonth.get(month) ?? []
    list.sort((a, b) => {
      const ad = a.plannedDate ?? ''
      const bd = b.plannedDate ?? ''
      if (ad !== bd) return ad.localeCompare(bd)
      return a.name.localeCompare(b.name, 'ja')
    })
    return { month, label, items: list }
  })

  overdue.sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? ''))
  unscheduled.sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  const futureYears: FutureYearPlanGroup[] = [...futureByYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([y, list]) => {
      list.sort((a, b) => {
        const ad = a.plannedDate ?? ''
        const bd = b.plannedDate ?? ''
        if (ad !== bd) return ad.localeCompare(bd)
        return a.name.localeCompare(b.name, 'ja')
      })
      return { year: y, label: `${y}年`, items: list }
    })

  return { overdue, months, unscheduled, futureYears }
}

export function summarizeAnnualPlan(items: AnnualPlanItem[]) {
  return {
    total: items.length,
    completed: items.filter((i) => i.completedInYear).length,
    overdue: items.filter((i) => i.status === 'overdue').length,
    unscheduled: items.filter((i) => i.status === 'unscheduled').length,
    scheduledThisYear: items.filter((i) => {
      if (!i.plannedDate || i.completedInYear) return false
      return i.status === 'scheduled' || i.status === 'due_this_month' || i.status === 'overdue'
    }).length,
  }
}
