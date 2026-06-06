'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { normalizeDeviceStatus } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { mapMaintenanceModelMasterRow } from '@/lib/maintenance-master'
import { dailyInspectionHref } from '@/lib/maintenance-inspection-url'
import {
  buildDailyInspectionEntries,
  DAILY_INSPECTION_RECORD_TYPE,
  type DailyInspectionEntry,
} from '@/lib/daily-inspection'

type Props = {
  /** ダッシュボード用のコンパクト表示 */
  compact?: boolean
  className?: string
}

export function DailyInspectionTodayList({ compact = false, className }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<DailyInspectionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dailyMasterCount, setDailyMasterCount] = useState(0)
  const [activeDeviceCount, setActiveDeviceCount] = useState(0)

  const todayLabel = format(new Date(), 'yyyy年M月d日（E）', { locale: ja })
  const pendingCount = entries.filter((e) => !e.completedToday).length

  const fetchList = useCallback(async () => {
    setLoading(true)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const [devRes, dailyRes, masRes] = await Promise.all([
      supabase.from('devices').select('*'),
      supabase
        .from('maintenance_records')
        .select('device_id, completed_date')
        .eq('type', DAILY_INSPECTION_RECORD_TYPE)
        .gte('completed_date', todayStr)
        .lte('completed_date', todayStr),
      supabase.from('maintenance_model_masters').select('*'),
    ])

    const devices = (devRes.data ?? []).filter((d: { status: string }) => {
      return normalizeDeviceStatus(d.status) !== 'disposed'
    })
    const masters = (masRes.data ?? []).map((row) =>
      mapMaintenanceModelMasterRow(row as Record<string, unknown>),
    )
    const completedToday = new Set<string>()
    for (const row of dailyRes.data ?? []) {
      const did = row.device_id as string | null
      if (did) completedToday.add(did)
    }

    setDailyMasterCount(masters.filter((m) => m.master_type === 'daily').length)
    setActiveDeviceCount(
      devices.filter((d: { status: string }) => normalizeDeviceStatus(d.status) === 'active').length,
    )
    setEntries(
      buildDailyInspectionEntries(
        devices as DailyInspectionEntry['device'][],
        masters,
        completedToday,
      ),
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void fetchList()
    const channel = supabase
      .channel('daily-inspection-today')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_records' },
        () => void fetchList(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        () => void fetchList(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_model_masters' },
        () => void fetchList(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchList, supabase])

  const listClass = compact ? 'max-h-48' : 'max-h-[min(60vh,32rem)]'

  return (
    <div className={cn('rounded-xl border-l-4 border-l-teal-500 bg-teal-50/35 border border-teal-100 shadow-sm overflow-hidden', className)}>
      <div className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-teal-50/80">
        <span className="flex items-center gap-2 text-sm font-semibold text-teal-950 min-w-0">
          <span className="truncate">本日の日常点検（{todayLabel}）</span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="border-teal-300 text-teal-900 bg-white text-[10px]">
            {loading ? '…' : `未実施 ${pendingCount} / ${entries.length}`}
          </Badge>
          {compact && (
            <Link href="/maintenance/daily" className="text-[10px] text-teal-800 underline">
              一覧へ
            </Link>
          )}
          {!compact && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void fetchList()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              更新
            </Button>
          )}
        </div>
      </div>
      <div className={cn('px-4 py-2 overflow-y-auto', listClass)}>
        {loading ? (
          <p className="text-sm text-teal-900/70 py-1">読み込み中…</p>
        ) : entries.length === 0 ? (
          <div className="text-xs text-teal-900/70 py-1 space-y-1.5">
            <p className="font-medium">本日の日常点検対象がありません。</p>
            <ul className="space-y-0.5 text-[11px] text-teal-800/80">
              {dailyMasterCount === 0 && (
                <li className="flex items-start gap-1">
                  <span className="shrink-0 text-red-500 mt-px">✗</span>
                  <span>
                    日常点検マスタ未登録 →
                    <Link href="/maintenance/master" className="underline ml-1">
                      マスタ画面の「日常点検」タブ
                    </Link>
                    で登録してください
                  </span>
                </li>
              )}
              {dailyMasterCount > 0 && activeDeviceCount === 0 && (
                <li className="flex items-start gap-1">
                  <span className="shrink-0 text-amber-500 mt-px">!</span>
                  <span>稼働中（ステータス: 利用中）の機器がありません。機器台帳を確認してください。</span>
                </li>
              )}
              {dailyMasterCount > 0 && activeDeviceCount > 0 && (
                <li className="flex items-start gap-1">
                  <span className="shrink-0 text-amber-500 mt-px">!</span>
                  <span>機器台帳の「メーカー」「型式」と日常点検マスタの値が一致しているか確認してください。</span>
                </li>
              )}
            </ul>
          </div>
        ) : (
          <ul className="divide-y divide-teal-100 text-sm">
            {entries.map(({ device: dev, items, completedToday }) => (
              <li
                key={dev.id}
                className={cn(
                  'py-2 first:pt-1 flex items-center justify-between gap-2',
                  !compact && 'py-3',
                )}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn('font-medium text-slate-900 truncate', compact ? 'text-xs' : 'text-sm')}>
                      {dev.name}
                    </span>
                    {dev.barcode && (
                      <span className="text-[10px] font-mono text-slate-500">{dev.barcode}</span>
                    )}
                    <Badge
                      className={cn(
                        'text-[9px] border-0 px-1 py-0',
                        completedToday
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-900',
                      )}
                    >
                      {completedToday ? '完了' : '未実施'}
                    </Badge>
                  </div>
                  <p className={cn('text-slate-500 truncate', compact ? 'text-[10px]' : 'text-xs')}>
                    {[dev.location, items.map((i) => i.label).join('・')].filter(Boolean).join(' / ')}
                  </p>
                </div>
                <Link
                  href={dailyInspectionHref(dev)}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'shrink-0 border-teal-200 text-teal-900',
                    compact ? 'h-6 text-[10px] px-2' : 'h-8 text-xs px-3',
                  )}
                >
                  {completedToday ? '再記録' : '点検へ'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
