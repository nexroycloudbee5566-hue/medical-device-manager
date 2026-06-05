import { format, startOfDay } from 'date-fns'
import { normalizeModelKeyPart } from '@/lib/maintenance-master'

export type DeviceForInitialPlan = {
  id: string
  barcode: string | null
  name: string
  manufacturer: string | null
  model: string | null
  status: string
  next_maintenance_due: string | null
}

/** 型式マスタと一致する稼働中機器 */
export function deviceMatchesModelPair(
  d: Pick<DeviceForInitialPlan, 'manufacturer' | 'model'>,
  manufacturer: string,
  model: string,
): boolean {
  return (
    normalizeModelKeyPart(d.manufacturer) === normalizeModelKeyPart(manufacturer) &&
    normalizeModelKeyPart(d.model) === normalizeModelKeyPart(model)
  )
}

/**
 * 初期計画の対象: 稼働中・定期点検未実施・次回予定未設定
 */
export function filterDevicesForInitialPlan(
  devices: DeviceForInitialPlan[],
  manufacturer: string,
  model: string,
  deviceIdsWithInspection: Set<string>,
): DeviceForInitialPlan[] {
  return devices
    .filter(
      (d) =>
        d.status === 'active' &&
        deviceMatchesModelPair(d, manufacturer, model) &&
        !deviceIdsWithInspection.has(d.id) &&
        !d.next_maintenance_due,
    )
    .sort((a, b) => {
      const ba = (a.barcode ?? '').localeCompare(b.barcode ?? '', 'ja')
      if (ba !== 0) return ba
      return a.name.localeCompare(b.name, 'ja')
    })
}

/**
 * 機器を当該年の1〜12月に均等配分（各月15日）。
 * 過去の月もその年の日付で設定し、年間計画の該当月列に載せる。
 */
export function buildEvenMonthlyDueDates(
  deviceIds: string[],
  today = new Date(),
  dayOfMonth = 15,
  planYear?: number,
): Map<string, string> {
  const result = new Map<string, string>()
  const baseYear = planYear ?? today.getFullYear()

  deviceIds.forEach((id, index) => {
    const month = (index % 12) + 1
    const candidate = startOfDay(new Date(baseYear, month - 1, dayOfMonth))
    result.set(id, format(candidate, 'yyyy-MM-dd'))
  })

  return result
}

/** 月ごとの件数サマリ（確認用） */
export function summarizeDueDatesByMonth(
  dueDates: Map<string, string>,
): { month: number; count: number }[] {
  const counts = new Array(12).fill(0)
  for (const iso of dueDates.values()) {
    const m = parseInt(iso.slice(5, 7), 10)
    if (m >= 1 && m <= 12) counts[m - 1]++
  }
  return counts.map((count, i) => ({ month: i + 1, count }))
}
