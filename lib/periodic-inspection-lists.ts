import { startOfDay } from 'date-fns'
import type { Device, MaintenanceModelMaster } from '@/lib/types'
import { normalizeDeviceStatus } from '@/lib/types'
import { deviceEligibleForAnnualPlan } from '@/lib/annual-maintenance-plan'
import {
  filterPeriodicMasters,
  mapMaintenanceModelMasterRow,
  matchMastersForDevice,
} from '@/lib/maintenance-master'
import {
  derivePlannedDate,
  isInspectionStale,
  inspectionDueDate,
  isPlannedInMonth,
  completedInspectionInMonth,
  periodicCycleLabel,
} from '@/lib/inspection-interval'

export type PeriodicInspectionDeviceRow = Pick<
  Device,
  'id' | 'name' | 'barcode' | 'manufacturer' | 'model' | 'next_maintenance_due' | 'location' | 'status'
>

export type PeriodicInspectionEntry = {
  device: PeriodicInspectionDeviceRow
  masterId: string
  cycleLabel: string
  lastInspection: string | null
  intervalMonths: number
  plannedDate: string | null
}

export type PeriodicRecordRow = {
  device_id: string | null
  completed_date: string | null
  maintenance_model_master_id?: string | null
  is_draft?: boolean | null
}

function isCompletedPeriodicRow(row: PeriodicRecordRow): boolean {
  if (row.is_draft === true) return false
  return Boolean(row.device_id && row.completed_date)
}

export function latestPeriodicByDeviceMasterKey(deviceId: string, masterId: string): string {
  return `${deviceId}::${masterId}`
}

/** 機器×サイクルの最終実施日。マスタ未紐づけ記録は、その機器の定期マスタが1件のときだけ採用 */
export function latestPeriodicInspectionByDeviceMaster(
  records: PeriodicRecordRow[],
  mastersForDevice: Map<string, MaintenanceModelMaster[]>,
): Map<string, string> {
  const latest = new Map<string, string>()
  const unscoped = new Map<string, string>()

  for (const row of records) {
    if (!isCompletedPeriodicRow(row)) continue
    const did = row.device_id as string
    const cd = (row.completed_date as string).slice(0, 10)
    const mid = row.maintenance_model_master_id
    if (mid) {
      const key = latestPeriodicByDeviceMasterKey(did, mid)
      const prev = latest.get(key)
      if (!prev || cd > prev) latest.set(key, cd)
      continue
    }
    const prev = unscoped.get(did)
    if (!prev || cd > prev) unscoped.set(did, cd)
  }

  for (const [deviceId, cycles] of mastersForDevice) {
    if (cycles.length !== 1) continue
    const orphan = unscoped.get(deviceId)
    if (!orphan) continue
    const key = latestPeriodicByDeviceMasterKey(deviceId, cycles[0].id)
    const prev = latest.get(key)
    if (!prev || orphan > prev) latest.set(key, orphan)
  }

  return latest
}

function plannedDateForCycle(
  device: PeriodicInspectionDeviceRow,
  cycle: MaintenanceModelMaster,
  cycleCount: number,
  last: string | null,
): string | null {
  const dueOverride = cycleCount === 1 ? device.next_maintenance_due : null
  return derivePlannedDate(dueOverride, last, cycle.inspection_interval_months)
}

export function buildPeriodicInspectionLists(
  devices: PeriodicInspectionDeviceRow[],
  masters: MaintenanceModelMaster[],
  latestByDeviceMaster: Map<string, string>,
  today = new Date(),
): { dueThisMonth: PeriodicInspectionEntry[]; stale: PeriodicInspectionEntry[] } {
  const periodicMasters = filterPeriodicMasters(masters)
  const todayStart = startOfDay(today)
  const dueMonth: PeriodicInspectionEntry[] = []
  const stale: PeriodicInspectionEntry[] = []

  for (const dev of devices) {
    if (!deviceEligibleForAnnualPlan(masters, dev)) continue

    const cycles = matchMastersForDevice(periodicMasters, dev.manufacturer, dev.model, 'periodic')
    if (cycles.length === 0) continue

    for (const cycle of cycles) {
      const last =
        latestByDeviceMaster.get(latestPeriodicByDeviceMasterKey(dev.id, cycle.id)) ?? null
      const plannedDate = plannedDateForCycle(dev, cycle, cycles.length, last)
      const intervalMonths = cycle.inspection_interval_months

      const entry: PeriodicInspectionEntry = {
        device: dev,
        masterId: cycle.id,
        cycleLabel: periodicCycleLabel(cycle),
        lastInspection: last,
        intervalMonths,
        plannedDate,
      }

      const hasItems = cycle.checklist_items.length > 0
      const dueOverride = cycles.length === 1 ? dev.next_maintenance_due : null
      const staleFlag = isInspectionStale(last, intervalMonths, dueOverride, todayStart)
      const monthFlag =
        isPlannedInMonth(plannedDate, todayStart) && !completedInspectionInMonth(last, todayStart)

      if (monthFlag) dueMonth.push(entry)

      if (normalizeDeviceStatus(dev.status) === 'active' && hasItems && staleFlag) {
        const dueDate = plannedDate ?? inspectionDueDate(last, intervalMonths)
        stale.push({ ...entry, plannedDate: dueDate })
      }
    }
  }

  const byPlanned = (a: PeriodicInspectionEntry, b: PeriodicInspectionEntry) =>
    (a.plannedDate ?? '9999-12-31').localeCompare(b.plannedDate ?? '9999-12-31')

  dueMonth.sort(byPlanned)
  stale.sort((a, b) => {
    if (a.lastInspection === null && b.lastInspection === null)
      return a.device.name.localeCompare(b.device.name, 'ja')
    if (a.lastInspection === null) return -1
    if (b.lastInspection === null) return 1
    return a.lastInspection.localeCompare(b.lastInspection)
  })

  return { dueThisMonth: dueMonth, stale }
}

/** 未点検の定期点検対象数（今月予定＋期限超過。機器×サイクル単位、重複は1件） */
export function countPeriodicPending(
  dueThisMonth: PeriodicInspectionEntry[],
  stale: PeriodicInspectionEntry[],
): number {
  const ids = new Set<string>()
  for (const e of stale) ids.add(`${e.device.id}::${e.masterId}`)
  for (const e of dueThisMonth) ids.add(`${e.device.id}::${e.masterId}`)
  return ids.size
}

export type PeriodicInspectionListMeta = {
  periodicMasterCount: number
  activeDeviceCount: number
}

export function mapPeriodicInspectionRows(
  devices: { status: string }[],
  mastersRaw: Record<string, unknown>[] | null,
  records: PeriodicRecordRow[] | null,
  today = new Date(),
): {
  dueThisMonth: PeriodicInspectionEntry[]
  stale: PeriodicInspectionEntry[]
  meta: PeriodicInspectionListMeta
} {
  const activeDevices = (devices ?? []).filter((d) => {
    const s = normalizeDeviceStatus(d.status)
    return s !== 'disposed'
  }) as PeriodicInspectionDeviceRow[]

  const allMasters = (mastersRaw ?? []).map((row) => mapMaintenanceModelMasterRow(row))
  const periodicMasters = filterPeriodicMasters(allMasters)
  const mastersForDevice = new Map<string, MaintenanceModelMaster[]>()
  for (const dev of activeDevices) {
    mastersForDevice.set(
      dev.id,
      matchMastersForDevice(periodicMasters, dev.manufacturer, dev.model, 'periodic'),
    )
  }

  const latestByDeviceMaster = latestPeriodicInspectionByDeviceMaster(
    records ?? [],
    mastersForDevice,
  )
  const lists = buildPeriodicInspectionLists(
    activeDevices,
    allMasters,
    latestByDeviceMaster,
    today,
  )

  return {
    ...lists,
    meta: {
      periodicMasterCount: periodicMasters.length,
      activeDeviceCount: activeDevices.filter(
        (d) => normalizeDeviceStatus(d.status) === 'active',
      ).length,
    },
  }
}
