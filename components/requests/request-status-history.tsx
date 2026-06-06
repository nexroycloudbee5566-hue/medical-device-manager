'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RequestLogRow } from '@/lib/request-logs'
import { deleteRequestLog } from '@/lib/request-logs'
import { RequestLogEditDialog } from '@/components/requests/request-log-edit-dialog'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Pencil, Trash2 } from 'lucide-react'

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
  /** 履歴の編集・削除を許可 */
  editable?: boolean
  onLogsChange?: () => void
}

export function RequestStatusHistory({
  logs,
  compact = false,
  className,
  maxHeight = 'max-h-48',
  editable = false,
  onLogsChange,
}: Props) {
  const supabase = createClient()
  const [editingLog, setEditingLog] = useState<RequestLogRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (logs.length === 0) return null

  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  async function handleDelete(log: RequestLogRow) {
    if (!confirm('この進行履歴を削除しますか？取り消せません。')) return
    setDeletingId(log.id)
    try {
      const err = await deleteRequestLog(supabase, log.id)
      if (err) {
        alert(`削除に失敗しました: ${err}`)
        return
      }
      onLogsChange?.()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
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
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
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
                  {editable && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                        onClick={() => setEditingLog(log)}
                        aria-label="履歴を編集"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                        disabled={deletingId === log.id}
                        onClick={() => void handleDelete(log)}
                        aria-label="履歴を削除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <RequestLogEditDialog
        log={editingLog}
        open={editingLog != null}
        onClose={() => setEditingLog(null)}
        onSaved={() => onLogsChange?.()}
      />
    </>
  )
}
