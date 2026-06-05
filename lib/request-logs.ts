import type { SupabaseClient } from '@supabase/supabase-js'
import type { RequestLog } from '@/lib/types'

export type RequestLogRow = RequestLog

const REQUEST_LOG_SELECT =
  'id, request_id, from_status, to_status, changed_by, notes, handled_by_name, created_at'

export async function fetchRequestLogs(
  supabase: SupabaseClient,
  requestId: string,
): Promise<RequestLogRow[]> {
  const { data, error } = await supabase
    .from('request_logs')
    .select(REQUEST_LOG_SELECT)
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[依頼履歴] 取得エラー:', error)
    return []
  }

  return (data as RequestLogRow[]) ?? []
}

/** 登録時に requests.notes だけに残っている古いデータ向け */
export function mergeRegistrationNotes(
  logs: RequestLogRow[],
  registrationNotes?: string | null,
): RequestLogRow[] {
  const text = registrationNotes?.trim()
  if (!text || logs.length === 0) return logs

  const first = logs[0]
  if (first.from_status != null || first.notes?.trim()) return logs

  return [{ ...first, notes: text }, ...logs.slice(1)]
}
