import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AuditAction, AuditEntityType } from '@/lib/audit-log'

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return null
  return createClient(url.replace(/\/$/, ''), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function clientInfoFromRequest(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip =
    forwarded?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  const userAgent = request.headers.get('user-agent') || null
  return { ip, userAgent }
}

export async function recordLoginAttempt(opts: {
  userId?: string | null
  userName?: string | null
  role?: 'admin' | 'staff' | null
  success: boolean
  failureReason?: string | null
  ip?: string | null
  userAgent?: string | null
}): Promise<void> {
  const admin = adminClient()
  if (!admin) return

  const { error } = await admin.from('login_history').insert({
    user_id: opts.userId ?? null,
    user_name: opts.userName ?? null,
    role: opts.role ?? null,
    success: opts.success,
    failure_reason: opts.failureReason ?? null,
    ip_address: opts.ip ?? null,
    user_agent: opts.userAgent ?? null,
  })

  if (error) {
    console.error('[ログイン履歴] 記録エラー:', error.message)
  }
}

export async function recordAuditLogServer(opts: {
  userId: string
  userName: string
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string | null
  summary: string
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  const admin = adminClient()
  if (!admin) return

  const { error } = await admin.from('audit_logs').insert({
    user_id: opts.userId,
    user_name: opts.userName,
    action: opts.action,
    entity_type: opts.entityType,
    entity_id: opts.entityId ?? null,
    summary: opts.summary,
    metadata: opts.metadata ?? null,
  })

  if (error) {
    console.error('[操作ログ] 記録エラー:', error.message)
  }
}
