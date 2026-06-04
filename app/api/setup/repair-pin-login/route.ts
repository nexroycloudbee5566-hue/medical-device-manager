import { NextResponse } from 'next/server'
import { validateAdminPin, validateStaffPin } from '@/lib/pin-auth'
import { attachPinAuthToExistingUser } from '@/lib/pin-user-server'

export const runtime = 'nodejs'

/** テーブル作成後、既存プロフィールに PIN ログインを付与（セットアップ用） */
export async function POST(request: Request) {
  const { supabaseUrl, serviceRoleKey, userId, pin, role } = await request.json()

  if (!supabaseUrl || !serviceRoleKey || !userId || typeof pin !== 'string' || !role) {
    return NextResponse.json({ error: '入力が不足しています' }, { status: 400 })
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
    await attachPinAuthToExistingUser(supabaseUrl.replace(/\/$/, ''), serviceRoleKey, {
      userId,
      pin,
      role,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'PIN の設定に失敗しました'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
