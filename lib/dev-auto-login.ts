import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { syntheticEmailForPinAuth } from '@/lib/pin-auth'
import { isAuthBypassEnabled } from '@/lib/auth-bypass'
import { resolveDevAutoLoginProfileId } from '@/lib/dev-auto-login-profile'

/** 開発用: 未ログインなら最初の管理者で自動サインイン（RLS 用） */
export async function tryDevAutoLogin(request: NextRequest, response: NextResponse) {
  if (!isAuthBypassEnabled()) return response

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) return response

  let nextResponse = response

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        nextResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          nextResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (user) return nextResponse

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const profileId = await resolveDevAutoLoginProfileId(admin)
  if (!profileId) return nextResponse

  const { data: secretRow } = await admin
    .from('profile_auth_secrets')
    .select('login_secret')
    .eq('user_id', profileId)
    .maybeSingle()

  if (!secretRow?.login_secret) return nextResponse

  const { error } = await supabase.auth.signInWithPassword({
    email: syntheticEmailForPinAuth(profileId),
    password: secretRow.login_secret,
  })

  if (error) {
    console.error('[dev-auto-login]', error.message)
    return nextResponse
  }

  return nextResponse
}