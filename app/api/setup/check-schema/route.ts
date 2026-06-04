import { NextResponse } from 'next/server'

async function tableReachable(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  /** PostgREST の select に使う既存カラム（profile_auth_secrets は id が無い） */
  selectColumn: string,
): Promise<boolean> {
  const base = supabaseUrl.replace(/\/$/, '')
  const res = await fetch(
    `${base}/rest/v1/${table}?select=${encodeURIComponent(selectColumn)}&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  )
  return res.status === 200
}

export async function POST(request: Request) {
  const { supabaseUrl, serviceRoleKey } = await request.json()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: '接続情報が不足しています' }, { status: 400 })
  }

  try {
    const [hospitals, profileAuthSecrets] = await Promise.all([
      tableReachable(supabaseUrl, serviceRoleKey, 'hospitals', 'id'),
      tableReachable(supabaseUrl, serviceRoleKey, 'profile_auth_secrets', 'user_id'),
    ])

    const ready = hospitals && profileAuthSecrets
    return NextResponse.json({
      exists: ready,
      ready,
      hospitals,
      profileAuthSecrets,
    })
  } catch {
    return NextResponse.json({
      exists: false,
      ready: false,
      hospitals: false,
      profileAuthSecrets: false,
    })
  }
}
