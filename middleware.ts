import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAuthBypassEnabled } from '@/lib/auth-bypass'
import { tryDevAutoLogin } from '@/lib/dev-auto-login'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isSetup = pathname.startsWith('/setup') || pathname.startsWith('/api/setup')
  if (isSetup) return NextResponse.next({ request })

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const url = request.nextUrl.clone()
    url.pathname = '/setup'
    return NextResponse.redirect(url)
  }

  const bypass = isAuthBypassEnabled()

  if (bypass && (pathname === '/' || pathname.startsWith('/auth'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (bypass && !user) {
    supabaseResponse = await tryDevAutoLogin(request, supabaseResponse)
    return supabaseResponse
  }

  if (pathname === '/auth' || pathname === '/auth/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? '/dashboard' : '/auth/login'
    return NextResponse.redirect(url)
  }

  if (bypass) return supabaseResponse

  if (!user && !pathname.startsWith('/auth') && !pathname.startsWith('/api/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}