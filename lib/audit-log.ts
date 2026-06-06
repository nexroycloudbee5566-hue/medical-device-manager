import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'import'
  | 'logout'
  | 'status_change'

export type AuditEntityType =
  | 'device'
  | 'request'
  | 'maintenance_record'
  | 'profile'
  | 'dashboard_message'
  | 'maintenance_master'
  | 'checklist_template'

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
  import: '一括取込',
  logout: 'ログアウト',
  status_change: 'ステータス変更',
}

export const AUDIT_ENTITY_LABEL: Record<AuditEntityType, string> = {
  device: '機器',
  request: '依頼',
  maintenance_record: '点検記録',
  profile: 'ユーザー',
  dashboard_message: 'お知らせ',
  maintenance_master: 'メンテマスタ',
  checklist_template: 'チェックリスト',
}

export interface AuditLogEvent {
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string | null
  summary: string
  metadata?: Record<string, unknown> | null
}

/** 操作ログを記録（失敗しても UI を止めない） */
export async function logAuditEvent(
  supabase: SupabaseClient,
  event: AuditLogEvent,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle()

    const { error } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_name: profile?.name?.trim() || '不明',
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      summary: event.summary,
      metadata: event.metadata ?? null,
    })

    if (error) {
      console.error('[操作ログ] 記録エラー:', error.message)
    }
  } catch (err) {
    console.error('[操作ログ] 例外:', err)
  }
}
