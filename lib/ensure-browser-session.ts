import type { SupabaseClient } from '@supabase/supabase-js'

let inflight: Promise<boolean> | null = null

/** 開発時: サーバー側セッションをブラウザの Supabase クライアントへ同期 */
export async function ensureBrowserSession(supabase: SupabaseClient): Promise<boolean> {
  if (process.env.NODE_ENV !== 'development') return true
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const { data: { session: existing } } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 3000),
        ),
      ])
      if (existing) return true

      await fetch('/api/auth/dev-session', { method: 'POST' })
      const res = await fetch('/api/auth/sync-session')
      if (!res.ok) return false

      const body = (await res.json()) as {
        access_token: string
        refresh_token: string
      }

      const { error: setErr } = await Promise.race([
        supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        }),
        new Promise<{ error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ error: { message: 'setSession timeout' } }), 8000),
        ),
      ])

      if (setErr) {
        console.error('[ensureBrowserSession]', setErr.message)
        return false
      }
      return true
    } catch (e) {
      console.error('[ensureBrowserSession]', e)
      return false
    } finally {
      inflight = null
    }
  })()

  return inflight
}