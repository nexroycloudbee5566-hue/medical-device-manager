import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateAdminPin, validateStaffPin } from '@/lib/pin-auth'
import { createPinAuthUser } from '@/lib/pin-user-server'
import { recordAuditLogServer } from '@/lib/audit-log-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabaseServer = await createServerClient()
  const { data: { user } } = await supabaseServer.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !url) {
    return NextResponse.json({ error: 'サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です' }, { status: 500 })
  }

  const { name, pin, role, hospital_id } = await request.json()

  if (!name || typeof pin !== 'string' || !role) {
    return NextResponse.json({ error: '氏名・PIN・権限は必須です' }, { status: 400 })
  }

  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: '権限が不正です' }, { status: 400 })
  }

  if (role === 'admin' && !validateAdminPin(pin)) {
    return NextResponse.json({ error: '管理者PINは8桁の数字です' }, { status: 400 })
  }
  if (role === 'staff' && !validateStaffPin(pin)) {
    return NextResponse.json({ error: '一般用PINは6桁の数字です' }, { status: 400 })
  }

  try {
    const newUserId = await createPinAuthUser(url, serviceRoleKey, {
      name,
      role,
      pin,
      hospital_id: hospital_id || null,
    })

    await recordAuditLogServer({
      userId: user.id,
      userName: profile?.name?.trim() || '管理者',
      action: 'create',
      entityType: 'profile',
      entityId: newUserId,
      summary: `ユーザーを作成（${name} / ${role === 'admin' ? '管理者' : '一般'}）`,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ユーザー作成に失敗しました'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
