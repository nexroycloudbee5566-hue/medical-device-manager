'use client'

import type { RequestLogRow } from '@/lib/request-logs'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { cn } from '@/lib/utils'

export type RequestLogWithProfile = RequestLogRow

export function getRequestLogActor(log: RequestLogWithProfile): string | null {
  const named = log.handled_by_name?.trim()
  if (named) return named
  const profileName = log.profiles?.name?.trim()
  if (profileName) return profileName
  return null
}

type Props = {
  logs: RequestLogWithProfile[]
  /** カード内などコンパクト表示 */
  compact?: boolean
  className?: string
  maxHeight?: string
}

export function RequestStatusHistory({
  logs,
  compact = false,
  className,
  maxHeight = 'max-h-48',
}: Props) {
  if (logs.length === 0) return null

  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('space-y-2 overflow-y-auto', !compact && maxHeight)}>
        {sorted.map((log) => {
          const actor = getRequestLogActor(log)
          const transition = log.from_status
            ? `${log.from_status} → ${log.to_status}`
            : `登録 → ${log.to_status}`

          return (
            <div
              key={log.id}
              className={cn(
                'rounded-md border border-slate-100 bg-slate-50/80',
                compact ? 'px-2.5 py-2 text-xs' : 'px-3 py-2.5 text-sm',
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-medium text-slate-800">{transition}</span>
                <span className="text-slate-400 whitespace-nowrap">
                  {format(new Date(log.created_at), compact ? 'M/d HH:mm' : 'yyyy/M/d HH:mm', {
                    locale: ja,
                  })}
                </span>
              </div>
              {actor && (
                <p className={cn('text-slate-600 mt-0.5', compact ? 'text-[11px]' : 'text-xs')}>
                  進行: <span className="font-medium text-slate-700">{actor}</span>
                </p>
              )}
              {log.notes?.trim() && (
                <p
                  className={cn(
                    'text-slate-500 mt-1 whitespace-pre-wrap break-words',
                    compact ? 'text-[11px]' : 'text-xs',
                  )}
                >
                  備考: {log.notes.trim()}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
