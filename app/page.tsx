import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAuthBypassEnabled } from '@/lib/auth-bypass'

export default async function RootPage() {
  if (isAuthBypassEnabled()) redirect('/dashboard')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  redirect('/auth/login')
}