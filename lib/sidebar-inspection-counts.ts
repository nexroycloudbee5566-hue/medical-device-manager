import { format } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildDailyInspectionEntries,
  DAILY_INSPECTION_RECORD_TYPE,
} from '@/lib/daily-inspection'
import { mapMaintenanceModelMasterRow } from '@/lib/maintenance-master'
import {
  countPeriodicPending,
  mapPeriodicInspectionRows,
} from '@/lib/periodic-inspection-lists'

export type SidebarInspectionCounts = {
  dailyPending: number
  periodicPending: number
}

export async function fetchSidebarInspectionCounts(
  supabase: SupabaseClient,
): Promise<SidebarInspectionCounts> {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [devRes, dailyRecRes, periodicRecRes, masRes] = await Promise.all([
    supabase.from('devices').select('*'),
    supabase
      .from('maintenance_records')
      .select('device_id, completed_date')
      .eq('type', DAILY_INSPECTION_RECORD_TYPE)
      .gte('completed_date', todayStr)
      .lte('completed_date', todayStr),
    supabase
      .from('maintenance_records')
      .select('device_id, completed_date')
      .eq('type', '定期点検')
      .not('completed_date', 'is', null),
    supabase.from('maintenance_model_masters').select('*'),
  ])

  const devices = devRes.data ?? []
  const masters = (masRes.data ?? []).map((row) =>
    mapMaintenanceModelMasterRow(row as Record<string, unknown>),
  )

  const completedToday = new Set<string>()
  for (const row of dailyRecRes.data ?? []) {
    const did = row.device_id as string | null
    if (did) completedToday.add(did)
  }

  const dailyEntries = buildDailyInspectionEntries(
    devices as Parameters<typeof buildDailyInspectionEntries>[0],
    masters,
    completedToday,
  )
  const dailyPending = dailyEntries.filter((e) => !e.completedToday).length

  const { dueThisMonth, stale } = mapPeriodicInspectionRows(
    devices,
    masRes.data as Record<string, unknown>[] | null,
    periodicRecRes.data,
  )

  return {
    dailyPending,
    periodicPending: countPeriodicPending(dueThisMonth, stale),
  }
}
