import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function POST(request: Request) {
  const { supabaseUrl, anonKey, serviceRoleKey } = await request.json()

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: '全ての項目を入力してください' }, { status: 400 })
  }

  if (!supabaseUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'Supabase URL は https:// から始まる必要があります' }, { status: 400 })
  }

  // URL の末尾スラッシュを除去して正規化
  const normalizedUrl = supabaseUrl.replace(/\/$/, '')

  // サーバーへの到達確認（HTTP レスポンスがあれば OK、ネットワークエラーのみ失敗）
  try {
    await fetch(`${normalizedUrl}/rest/v1/`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(8000),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('timeout') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
      return NextResponse.json({ error: 'Supabase に接続できませんでした。URLを確認してください。' }, { status: 400 })
    }
    // その他のエラーは無視して続行（CORS 等のエラーはサーバー側では発生しない）
  }

  const envContent = [
    `NEXT_PUBLIC_SUPABASE_URL=${normalizedUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey.trim()}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey.trim()}`,
  ].join('\n') + '\n'

  const envPath = path.join(process.cwd(), '.env.local')
  fs.writeFileSync(envPath, envContent, 'utf-8')

  return NextResponse.json({ success: true })
}
