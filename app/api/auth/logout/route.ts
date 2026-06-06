import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { recordAuditLogServer } from '@/lib/audit-log-server'

export const runtime = 'nodejs'

export async function POST() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!anonKey || !url) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
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

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle()

    await recordAuditLogServer({
      userId: user.id,
      userName: profile?.name?.trim() || '不明',
      action: 'logout',
      entityType: 'profile',
      entityId: user.id,
      summary: 'ログアウトしました',
    })
  }

  await supabase.auth.signOut()
  return response
}
