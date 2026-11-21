import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'
import { DevSessionProvider } from '@/components/dev-session-provider'
import { isAuthBypassEnabled } from '@/lib/auth-bypass'
import type { Profile } from '@/lib/types'

const DEV_GUEST_PROFILE: Profile = {
  id: '00000000-0000-0000-0000-000000000001',
  hospital_id: null,
  name: 'ローカル開発',
  role: 'admin',
  created_at: '',
  updated_at: '',
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const bypass = isAuthBypassEnabled()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !bypass) redirect('/auth/login')

  let profile: Profile | null = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data as Profile | null
  }

  if (!profile && bypass) profile = DEV_GUEST_PROFILE

  return (
    <div className="flex h-full">
      <Sidebar profile={profile} userEmail={user?.email ?? ''} />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <DevSessionProvider enabled={bypass}>{children}</DevSessionProvider>
      </main>
    </div>
  )
}