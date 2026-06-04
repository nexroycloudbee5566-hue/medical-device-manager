'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Profile } from '@/lib/types'
import { isSyntheticPinEmail } from '@/lib/pin-auth'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Cpu,
  Wrench,
  History,
  Users,
  LogOut,
  Stethoscope,
  Hammer,
  ShoppingCart,
  ClipboardList,
  CalendarRange,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard, match: (p: string) => p === '/dashboard' },
  { href: '/requests/repair', label: '修理依頼', icon: Hammer, match: (p: string) => p.startsWith('/requests/repair') },
  { href: '/requests/purchase', label: '購入依頼', icon: ShoppingCart, match: (p: string) => p.startsWith('/requests/purchase') },
  { href: '/devices', label: '機器台帳', icon: Cpu, match: (p: string) => p.startsWith('/devices') },
  { href: '/maintenance/master', label: 'メンテナンスマスタ', icon: ClipboardList, match: (p: string) => p.startsWith('/maintenance/master') },
  { href: '/maintenance/annual', label: '年間メンテ計画', icon: CalendarRange, match: (p: string) => p.startsWith('/maintenance/annual') },
  { href: '/maintenance', label: '定期点検', icon: Wrench, match: (p: string) => p === '/maintenance' },
  { href: '/history', label: '履歴管理', icon: History, match: (p: string) => p.startsWith('/history') },
]

interface SidebarProps {
  profile: Profile | null
  userEmail: string
}

export function Sidebar({ profile, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initials = profile?.name
    ? profile.name.slice(0, 2)
    : (profile?.role === 'admin' ? 'AD' : 'CE')

  const subLine =
    userEmail && !isSyntheticPinEmail(userEmail)
      ? userEmail
      : profile?.role === 'admin'
        ? '管理者（PINログイン）'
        : '一般CE（PINログイン）'

  return (
    <aside className="w-60 flex flex-col bg-white border-r border-slate-200 shrink-0">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="p-1.5 bg-blue-600 rounded-lg">
          <Stethoscope className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 leading-tight">医療機器管理</p>
          <p className="text-xs text-slate-400 truncate">グループ病院</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon, match }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              match(pathname)
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}

        {profile?.role === 'admin' && (
          <>
            <Separator className="my-2" />
            <Link
              href="/admin/users"
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <Users className="h-4 w-4 shrink-0" />
              ユーザー管理
            </Link>
          </>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-slate-100 space-y-3">
        <div className="flex items-center gap-3 px-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">
              {profile?.name || '未設定'}
            </p>
            <p className="text-xs text-slate-400 truncate">{subLine}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-500 hover:text-red-600 hover:bg-red-50"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </div>
    </aside>
  )
}
