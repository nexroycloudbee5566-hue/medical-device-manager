import { NextResponse } from 'next/server'
import { fetchPinLoginProfiles } from '@/lib/profile-options'

export const runtime = 'nodejs'

/** PIN でログインできるユーザーの一覧（氏名のみ）。role=admin | staff */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'role が不正です' }, { status: 400 })
  }

  const result = await fetchPinLoginProfiles(role)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ profiles: result.profiles, hint: result.hint })
}
