import { NextResponse } from 'next/server'
import { validateAdminPin } from '@/lib/pin-auth'
import { createPinAuthUser } from '@/lib/pin-user-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { supabaseUrl, serviceRoleKey, name, pin } = await request.json()

  if (!name || typeof pin !== 'string') {
    return NextResponse.json({ error: '氏名とPINを入力してください' }, { status: 400 })
  }
  if (!validateAdminPin(pin)) {
    return NextResponse.json({ error: '管理者PINは8桁の数字です' }, { status: 400 })
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase の接続情報が不足しています。Step 1 からやり直してください。' }, { status: 400 })
  }

  try {
    await createPinAuthUser(supabaseUrl.replace(/\/$/, ''), serviceRoleKey, {
      name,
      role: 'admin',
      pin,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '管理者の作成に失敗しました'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
