import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAuthBypassEnabled } from '@/lib/auth-bypass'

export const runtime = 'nodejs'

/**
 * 開発用: サーバー側の Supabase セッションをブラウザクライアントへ渡す。
 * SSR クッキーは HttpOnly のため createBrowserClient が単体では読めないことがある。
 */
export async function GET() {
  if (!isAuthBypassEnabled()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token || !session.refresh_token) {
    return NextResponse.json({ error: 'no session' }, { status: 401 })
  }

  return NextResponse.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
}