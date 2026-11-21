import type { SupabaseClient } from '@supabase/supabase-js'

/** 開発バイパス時の自動サインイン対象（profiles.id） */
export async function resolveDevAutoLoginProfileId(
  adminClient: SupabaseClient,
): Promise<string | null> {
  const explicitId = process.env.DEV_AUTO_LOGIN_USER_ID?.trim()
  if (explicitId) {
    const { data: row } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', explicitId)
      .maybeSingle()
    return row?.id ?? null
  }

  const roleRaw = (process.env.DEV_AUTO_LOGIN_ROLE ?? 'admin').trim().toLowerCase()
  const role = roleRaw === 'staff' ? 'staff' : 'admin'

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', role)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  return profile?.id ?? null
}