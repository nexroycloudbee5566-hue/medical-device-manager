import type { SupabaseClient } from '@supabase/supabase-js'
import type { Device, MaintenanceRecord } from '@/lib/types'

export const PERIODIC_INSPECTION_TYPE = '定期点検'

/** 完了済み定期点検のみ（一時保存を除く） */
export function completedPeriodicInspectionFilter() {
  return { type: PERIODIC_INSPECTION_TYPE, is_draft: false } as const
}

export function isPeriodicInspectionDraft(record: Pick<MaintenanceRecord, 'type' | 'is_draft'>): boolean {
  return record.type === PERIODIC_INSPECTION_TYPE && record.is_draft === true
}

export async function fetchPeriodicDraftForDevice(
  supabase: SupabaseClient,
  deviceId: string,
): Promise<MaintenanceRecord | null> {
  const { data, error } = await supabase
    .from('maintenance_records')
    .select('*')
    .eq('device_id', deviceId)
    .eq('type', PERIODIC_INSPECTION_TYPE)
    .eq('is_draft', true)
    .maybeSingle()

  if (error) {
    console.error('[定期点検] 一時保存取得エラー:', error.message)
    return null
  }
  return (data as MaintenanceRecord) ?? null
}

export type PeriodicDraftListEntry = {
  recordId: string
  device: Pick<Device, 'id' | 'name' | 'barcode' | 'manufacturer' | 'model' | 'location'>
  savedAt: string
}

export async function fetchPeriodicDraftList(
  supabase: SupabaseClient,
): Promise<PeriodicDraftListEntry[]> {
  const { data, error } = await supabase
    .from('maintenance_records')
    .select('id, created_at, devices(id, name, barcode, manufacturer, model, location)')
    .eq('type', PERIODIC_INSPECTION_TYPE)
    .eq('is_draft', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[定期点検] 一時保存一覧取得エラー:', error.message)
    return []
  }

  const entries: PeriodicDraftListEntry[] = []
  for (const row of data ?? []) {
    const dev = row.devices as PeriodicDraftListEntry['device'] | null
    if (!dev?.id) continue
    entries.push({
      recordId: row.id as string,
      device: dev,
      savedAt: (row.created_at as string) ?? '',
    })
  }
  return entries
}
