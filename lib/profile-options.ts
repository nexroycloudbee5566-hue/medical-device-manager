import { createClient } from '@supabase/supabase-js'

export type ProfileOption = { id: string; name: string }

export type ProfileOptionsResult = {
  profiles: ProfileOption[]
  hint?: string
  error?: string
}

export async function fetchPinLoginProfiles(
  role: 'admin' | 'staff',
): Promise<ProfileOptionsResult> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !url) {
    return { profiles: [], error: 'サーバー設定エラー（.env.local を確認してください）' }
  }

  const admin = createClient(url.replace(/\/$/, ''), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: secrets, error: secErr } = await admin.from('profile_auth_secrets').select('user_id')
  if (secErr) {
    const missingTable =
      secErr.message.includes('profile_auth_secrets') || secErr.code === 'PGRST205'
    return {
      profiles: [],
      error: missingTable
        ? 'profile_auth_secrets テーブルがありません。Supabase SQL エディタで supabase/fix_profile_auth_secrets.sql を実行してください。'
        : secErr.message,
    }
  }

  const ids = (secrets ?? []).map((s) => s.user_id as string)
  if (ids.length === 0) {
    return { profiles: [] }
  }

  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, name')
    .eq('role', role)
    .in('id', ids)
    .order('name')

  if (profErr) {
    return { profiles: [], error: profErr.message }
  }

  const result = (profiles ?? []) as ProfileOption[]
  let hint: string | undefined

  if (result.length === 0) {
    const { count: roleCount } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', role)

    const withPin = ids.length
    if ((roleCount ?? 0) > 0) {
      hint =
        role === 'admin'
          ? `profiles に管理者は ${roleCount} 人いますが、PIN（profile_auth_secrets）が未設定です。/setup の③で管理者を作り直すか、Supabase で role が admin か確認してください。`
          : `profiles に一般ユーザーは ${roleCount} 人いますが、PIN が未設定のため表示できません。`
    } else if (withPin > 0 && role === 'admin') {
      hint =
        'PIN 設定済みユーザーはいますが、profiles.role が admin の人がいません。ユーザーの権限を「管理者」に変更するか、/setup で管理者を新規作成してください。'
    }
  }

  return { profiles: result, hint }
}
