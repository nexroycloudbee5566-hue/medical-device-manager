import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isAuthBypassEnabled } from '@/lib/auth-bypass'
import { syntheticEmailForPinAuth } from '@/lib/pin-auth'

export const runtime = 'nodejs'

/** 開発用: ブラウザがセッションを持たないときのフォールバック */
export async function POST() {
  if (!isAuthBypassEnabled()) {
    return NextResponse.json({ error: 'not available' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
  }

  const cookieStore = await cookies()
  const response = NextResponse.json({ ok: true })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (user) return response

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (!profile?.id) {
    return NextResponse.json({ error: '管理者ユーザーがありません' }, { status: 500 })
  }

  const { data: secretRow } = await admin
    .from('profile_auth_secrets')
    .select('login_secret')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!secretRow?.login_secret) {
    return NextResponse.json({ error: 'PIN 未設定の管理者です' }, { status: 500 })
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: syntheticEmailForPinAuth(profile.id),
    password: secretRow.login_secret,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return response
}