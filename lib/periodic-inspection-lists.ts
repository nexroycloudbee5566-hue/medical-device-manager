import { startOfDay } from 'date-fns'
import type { Device, MaintenanceModelMaster } from '@/lib/types'
import { normalizeDeviceStatus } from '@/lib/types'
import { deviceEligibleForAnnualPlan } from '@/lib/annual-maintenance-plan'
import {
  deviceHasInspectionMaster,
  filterPeriodicMasters,
  mapMaintenanceModelMasterRow,
} from '@/lib/maintenance-master'
import {
  derivePlannedDate,
  getIntervalMonthsForDevice,
  isInspectionStale,
  inspectionDueDate,
  isPlannedInMonth,
  completedInspectionInMonth,
} from '@/lib/inspection-interval'

export type PeriodicInspectionDeviceRow = Pick<
  Device,
  'id' | 'name' | 'barcode' | 'manufacturer' | 'model' | 'next_maintenance_due' | 'location' | 'status'
>

export type PeriodicInspectionEntry = {
  device: PeriodicInspectionDeviceRow
  lastInspection: string | null
  intervalMonths: number
  plannedDate: string | null
}

export function latestPeriodicInspectionByDevice(
  records: { device_id: string | null; completed_date: string | null }[],
): Map<string, string> {
  const latestByDevice = new Map<string, string>()
  for (const row of records) {
    const did = row.device_id
    const cd = row.completed_date
    if (!did || !cd) continue
    const prev = latestByDevice.get(did)
    if (!prev || cd > prev) latestByDevice.set(did, cd.slice(0, 10))
  }
  return latestByDevice
}

export function buildPeriodicInspectionLists(
  devices: PeriodicInspectionDeviceRow[],
  masters: MaintenanceModelMaster[],
  latestByDevice: Map<string, string>,
  today = new Date(),
): { dueThisMonth: PeriodicInspectionEntry[]; stale: PeriodicInspectionEntry[] } {
  const periodicMasters = filterPeriodicMasters(masters)
  const todayStart = startOfDay(today)
  const dueMonth: PeriodicInspectionEntry[] = []
  const stale: PeriodicInspectionEntry[] = []

  for (const dev of devices) {
    if (!deviceEligibleForAnnualPlan(masters, dev)) continue

    const last = latestByDevice.get(dev.id) ?? null
    const intervalMonths = getIntervalMonthsForDevice(masters, dev.manufacturer, dev.model)
    const plannedDate = derivePlannedDate(dev.next_maintenance_due, last, intervalMonths)

    const entry: PeriodicInspectionEntry = {
      device: dev,
      lastInspection: last,
      intervalMonths,
      plannedDate,
    }

    const hasItems = deviceHasInspectionMaster(periodicMasters, dev)
    const staleFlag = isInspectionStale(last, intervalMonths, dev.next_maintenance_due, todayStart)
    const monthFlag =
      isPlannedInMonth(plannedDate, todayStart) && !completedInspectionInMonth(last, todayStart)

    if (monthFlag) dueMonth.push(entry)

    if (normalizeDeviceStatus(dev.status) === 'active' && hasItems && staleFlag) {
      const dueDate =
        dev.next_maintenance_due?.slice(0, 10) ?? inspectionDueDate(last, intervalMonths)
      stale.push({ ...entry, plannedDate: dueDate })
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

export type PeriodicInspectionListMeta = {
  periodicMasterCount: number
  activeDeviceCount: number
}

export function mapPeriodicInspectionRows(
  devices: { status: string }[],
  mastersRaw: Record<string, unknown>[] | null,
  records: { device_id: string | null; completed_date: string | null }[] | null,
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
  const latestByDevice = latestPeriodicInspectionByDevice(records ?? [])
  const lists = buildPeriodicInspectionLists(activeDevices, allMasters, latestByDevice, today)

  return {
    ...lists,
    meta: {
      periodicMasterCount: filterPeriodicMasters(allMasters).length,
      activeDeviceCount: activeDevices.filter(
        (d) => normalizeDeviceStatus(d.status) === 'active',
      ).length,
    },
  }
}
