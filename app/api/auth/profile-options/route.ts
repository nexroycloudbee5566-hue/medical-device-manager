import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/** PIN でログインできるユーザーの一覧（氏名のみ）。role=admin | staff */
export async function GET(request: Request) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !url) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'role が不正です' }, { status: 400 })
  }

  const admin = createClient(url.replace(/\/$/, ''), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: secrets, error: secErr } = await admin.from('profile_auth_secrets').select('user_id')
  if (secErr) {
    const missingTable =
      secErr.message.includes('profile_auth_secrets') ||
      secErr.code === 'PGRST205'
    return NextResponse.json(
      {
        error: missingTable
          ? 'profile_auth_secrets テーブルがありません。Supabase SQL エディタで supabase/fix_profile_auth_secrets.sql を実行してください。'
          : secErr.message,
      },
      { status: 500 },
    )
  }

  const ids = (secrets ?? []).map((s) => s.user_id)
  if (ids.length === 0) {
    return NextResponse.json({ profiles: [] })
  }

  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, name')
    .eq('role', role)
    .in('id', ids)
    .order('name')

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  const result = profiles ?? []
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

  return NextResponse.json({ profiles: result, hint })
}
