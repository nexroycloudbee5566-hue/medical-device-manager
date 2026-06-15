import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type Props = {
  name: string
  barcode?: string | null
  location?: string | null
  meta?: ReactNode
  href: string
  metaClassName?: string
  actionLabel?: string
  trailing?: ReactNode
}

/** ダッシュボード点検一覧用：コンパクト行（設置場所あり） */
export function DashboardInspectionDeviceRow({
  name,
  barcode,
  location,
  meta,
  href,
  metaClassName,
  actionLabel = '点検へ',
  trailing,
}: Props) {
  return (
    <li className="py-1 flex items-start gap-2 min-w-0 border-b border-black/[0.04] last:border-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
          <span className="text-xs font-medium text-slate-900 truncate shrink">{name}</span>
          {barcode && (
            <span className="text-[10px] font-mono text-slate-400 shrink-0">{barcode}</span>
          )}
          {meta && (
            <span className={cn('text-[10px] truncate min-w-0', metaClassName)}>{meta}</span>
          )}
        </div>
        {location?.trim() && (
          <p className="text-[10px] text-slate-500 truncate">{location.trim()}</p>
        )}
      </div>
      {trailing}
      <Link
        href={href}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'shrink-0 h-6 text-[10px] px-2 mt-0.5',
        )}
      >
        {actionLabel}
      </Link>
    </li>
  )
}

export const dashboardInspectionGridClass =
  'grid grid-cols-1 md:grid-cols-2 gap-x-4 auto-rows-min content-start'

/** パネル幅が狭いとき（横並び2パネル内）は1列 */
export const dashboardInspectionListClass = 'flex flex-col'
