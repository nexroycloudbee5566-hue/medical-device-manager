import type { MaintenanceChecklistItem, MaintenanceModelMaster } from '@/lib/types'
import { filterMastersByType, matchMasterForDevice } from '@/lib/maintenance-master'

export const DAILY_INSPECTION_RECORD_TYPE = '日常点検'

/** その日実施する点検項目（毎日。未設定は毎日扱い） */
export function itemsDueForDailyInspection(
  items: MaintenanceChecklistItem[],
): MaintenanceChecklistItem[] {
  return items.filter((i) => (i.frequency ?? 'daily') === 'daily')
}

export function deviceHasDailyInspectionMaster(
  masters: MaintenanceModelMaster[],
  dev: Pick<{ manufacturer?: string | null; model?: string | null }, 'manufacturer' | 'model'>,
): boolean {
  const m = matchMasterForDevice(masters, dev.manufacturer, dev.model, 'daily')
  return m != null && itemsDueForDailyInspection(m.checklist_items).length > 0
}

export type DailyInspectionDeviceRow = {
  id: string
  name: string
  barcode: string | null
  manufacturer: string | null
  model: string | null
  location: string | null
  department?: string | null
  status: string
}

export type DailyInspectionEntry = {
  device: DailyInspectionDeviceRow
  master: MaintenanceModelMaster
  items: MaintenanceChecklistItem[]
  completedToday: boolean
}

export function buildDailyInspectionEntries(
  devices: DailyInspectionDeviceRow[],
  masters: MaintenanceModelMaster[],
  completedTodayDeviceIds: Set<string>,
): DailyInspectionEntry[] {
  const dailyMasters = filterMastersByType(masters, 'daily')
  const entries: DailyInspectionEntry[] = []

  for (const dev of devices) {
    if (dev.status !== 'active') continue
    const master = matchMasterForDevice(
      dailyMasters,
      dev.manufacturer,
      dev.model,
      'daily',
    )
    if (!master) continue
    const items = itemsDueForDailyInspection(master.checklist_items)
    if (items.length === 0) continue
    entries.push({
      device: dev,
      master,
      items,
      completedToday: completedTodayDeviceIds.has(dev.id),
    })
  }

  entries.sort((a, b) => {
    if (a.completedToday !== b.completedToday) return a.completedToday ? 1 : -1
    return a.device.name.localeCompare(b.device.name, 'ja')
  })

  return entries
}
