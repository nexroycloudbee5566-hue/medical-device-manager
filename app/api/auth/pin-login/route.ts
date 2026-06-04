import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { syntheticEmailForPinAuth, validateAdminPin, validateStaffPin } from '@/lib/pin-auth'
import { verifyPin } from '@/lib/pin-user-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!anonKey || !url || !serviceRoleKey) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
  }

  const body = await request.json().catch(() => null) as {
    profileId?: string
    pin?: string
    mode?: string
  } | null

  const profileId = body?.profileId?.trim()
  const pin = body?.pin ?? ''
  const mode = body?.mode === 'admin' ? 'admin' : body?.mode === 'staff' ? 'staff' : null

  if (!profileId || !mode) {
    return NextResponse.json({ error: '入力が不正です' }, { status: 400 })
  }

  if (mode === 'admin' && !validateAdminPin(pin)) {
    return NextResponse.json({ error: '管理者PINは8桁の数字です' }, { status: 400 })
  }
  if (mode === 'staff' && !validateStaffPin(pin)) {
    return NextResponse.json({ error: '一般用PINは6桁の数字です' }, { status: 400 })
  }

  const admin = createClient(url.replace(/\/$/, ''), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', profileId)
    .single()

  if (profErr || !profile) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 401 })
  }

  if (profile.role !== mode) {
    return NextResponse.json({ error: '権限が一致しません' }, { status: 401 })
  }

  const { data: secretRow, error: secErr } = await admin
    .from('profile_auth_secrets')
    .select('pin_hash, login_secret')
    .eq('user_id', profileId)
    .single()

  if (secErr || !secretRow) {
    return NextResponse.json({ error: 'PINログインが設定されていません。管理者に連絡してください。' }, { status: 401 })
  }

  const pinOk = await verifyPin(pin, secretRow.pin_hash)
  if (!pinOk) {
    return NextResponse.json({ error: 'PINが正しくありません' }, { status: 401 })
  }

  const cookieStore = await cookies()
  const response = NextResponse.json({ success: true })

  const supabase = createServerClient(url.replace(/\/$/, ''), anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const email = syntheticEmailForPinAuth(profileId)
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email,
    password: secretRow.login_secret,
  })

  if (signErr) {
    return NextResponse.json({ error: 'ログインに失敗しました。しばらく待って再度お試しください。' }, { status: 500 })
  }

  return response
}
