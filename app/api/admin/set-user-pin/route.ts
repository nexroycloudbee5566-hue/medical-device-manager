import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateAdminPin, validateStaffPin } from '@/lib/pin-auth'
import { hashPin } from '@/lib/pin-user-server'
import { recordAuditLogServer } from '@/lib/audit-log-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabaseServer = await createServerClient()
  const { data: { user } } = await supabaseServer.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { data: me } = await supabaseServer.from('profiles').select('role, name').eq('id', user.id).single()
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !url) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
  }

  const { userId, pin } = await request.json()
  if (!userId || typeof pin !== 'string') {
    return NextResponse.json({ error: '入力が不正です' }, { status: 400 })
  }

  const admin = createClient(url.replace(/\/$/, ''), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: target, error: tErr } = await admin
    .from('profiles')
    .select('id, role, name')
    .eq('id', userId)
    .single()

  if (tErr || !target) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
  }

  if (target.role === 'admin' && !validateAdminPin(pin)) {
    return NextResponse.json({ error: '管理者PINは8桁の数字です' }, { status: 400 })
  }
  if (target.role === 'staff' && !validateStaffPin(pin)) {
    return NextResponse.json({ error: '一般用PINは6桁の数字です' }, { status: 400 })
  }

  const pinHash = await hashPin(pin)

  const { data: updated, error: upErr } = await admin
    .from('profile_auth_secrets')
    .update({ pin_hash: pinHash })
    .eq('user_id', userId)
    .select('user_id')

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 })
  }
  if (!updated?.length) {
    return NextResponse.json({
      error: 'このユーザーには PIN 用データがありません。PIN でログインできるユーザーとして新規作成してください。',
    }, { status: 400 })
  }

  await recordAuditLogServer({
    userId: user.id,
    userName: me?.name?.trim() || '管理者',
    action: 'update',
    entityType: 'profile',
    entityId: userId,
    summary: `ユーザーの PIN を変更（${target.name}）`,
  })

  return NextResponse.json({ success: true })
}
