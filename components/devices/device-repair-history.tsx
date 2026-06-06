'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Request } from '@/lib/types'
import { getRequestMeNo } from '@/lib/request-display'
import { REPAIR_ROUTE_LABEL } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { REQUEST_STATUS_COLORS } from '@/components/requests/request-card'

type Props = {
  deviceId: string
  /** 親画面で既知の ME No.（省略時は依頼から取得） */
  meNo?: string | null
  limit?: number
}

export function DeviceRepairHistory({ deviceId, meNo: knownMeNo, limit = 8 }: Props) {
  const supabase = createClient()
  const [records, setRecords] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('requests')
      .select('id, status, description, updated_at, created_at, repair_route, repair_content, replacement_parts, devices(barcode)')
      .eq('device_id', deviceId)
      .eq('type', 'repair')
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[機器カルテ] 修理履歴取得エラー:', error.message)
      setRecords([])
    } else {
      setRecords((data as unknown as Request[]) ?? [])
    }
    setLoading(false)
  }, [deviceId, limit, supabase])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="text-xs text-slate-400">修理履歴を読み込み中…</p>
  }

  if (records.length === 0) {
    return <p className="text-xs text-slate-400">修理履歴はありません</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead className="text-xs w-24">日付</TableHead>
          <TableHead className="text-xs w-24">ME No.</TableHead>
          <TableHead className="text-xs w-20">区分</TableHead>
          <TableHead className="text-xs w-20">状態</TableHead>
          <TableHead className="text-xs">内容</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((req) => {
          const detail = [
            req.description?.trim(),
            req.repair_content?.trim() ? `修理: ${req.repair_content.trim()}` : null,
            req.replacement_parts?.trim() ? `パーツ: ${req.replacement_parts.trim()}` : null,
          ].filter(Boolean).join(' / ')

          return (
            <TableRow key={req.id}>
              <TableCell className="text-xs align-top whitespace-nowrap">
                {format(new Date(req.updated_at), 'yyyy/MM/dd', { locale: ja })}
              </TableCell>
              <TableCell className="text-xs align-top font-mono whitespace-nowrap">
                {getRequestMeNo(req) ?? knownMeNo ?? '—'}
              </TableCell>
              <TableCell className="text-xs align-top">
                {req.repair_route ? (
                  <span className="text-slate-600">{REPAIR_ROUTE_LABEL[req.repair_route]}</span>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-xs align-top">
                <Badge
                  className={`text-[10px] border-0 ${REQUEST_STATUS_COLORS[req.status] ?? 'bg-slate-100 text-slate-700'}`}
                >
                  {req.status}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-slate-600 align-top max-w-[14rem] break-words">
                {detail || '—'}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
