'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { CalendarClock, CalendarDays, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  differenceInCalendarDays,
  format,
  parse,
  startOfDay,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { maintenanceInspectionHref } from '@/lib/maintenance-inspection-url'
import {
  mapPeriodicInspectionRows,
  type PeriodicInspectionEntry,
  type PeriodicInspectionListMeta,
} from '@/lib/periodic-inspection-lists'
import { intervalMonthsLabel } from '@/lib/inspection-interval'

type Props = {
  className?: string
}

function formatYmd(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  return ymd.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')
}

function DueThisMonthPanel({
  loading,
  entries,
  meta,
  monthLabel,
}: {
  loading: boolean
  entries: PeriodicInspectionEntry[]
  meta: PeriodicInspectionListMeta
  monthLabel: string
}) {
  return (
    <div className="flex flex-col rounded-xl border-l-4 border-l-blue-500 bg-blue-50/35 border border-blue-100 shadow-sm overflow-hidden min-h-[12rem]">
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 bg-blue-50/80 border-b border-blue-100">
        <span className="flex items-center gap-2 text-sm font-semibold text-blue-950 min-w-0">
          <CalendarDays className="h-4 w-4 text-blue-700 shrink-0" />
          <span className="truncate">{monthLabel}の定期点検</span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="border-blue-300 text-blue-900 bg-white text-[10px]">
            {loading ? '…' : `${entries.length} 件`}
          </Badge>
          <Link href="/maintenance/annual" className="text-[10px] text-blue-700 underline">
            年間計画
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 max-h-[min(50vh,20rem)]">
        {loading ? (
          <p className="text-sm text-blue-900/70 py-2">読み込み中…</p>
        ) : entries.length === 0 ? (
          <div className="text-sm text-blue-900/70 py-2 space-y-1.5">
            <p>今月予定の定期点検はありません。</p>
            {meta.periodicMasterCount === 0 && (
              <p className="text-[11px] text-blue-800/80">
                定期点検マスタが未登録です。
                <Link href="/maintenance/master" className="underline ml-1">
                  マスタ画面
                </Link>
                の「定期点検」タブで登録してください。
              </p>
            )}
            {meta.periodicMasterCount > 0 && meta.activeDeviceCount === 0 && (
              <p className="text-[11px] text-blue-800/80">
                稼働中（利用中）の機器がありません。機器台帳のステータスを確認してください。
              </p>
            )}
            {meta.periodicMasterCount > 0 && meta.activeDeviceCount > 0 && (
              <p className="text-[11px] text-blue-800/80">
                機器台帳の「メーカー」「型式」と定期点検マスタの値が一致しているか確認してください。
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-blue-100 text-sm">
            {entries.map(({ device: dev, lastInspection, plannedDate }) => {
              const planned = plannedDate ? parse(plannedDate, 'yyyy-MM-dd', new Date()) : null
              const isPast = planned && startOfDay(planned) < startOfDay(new Date())
              return (
                <li key={dev.id} className="py-2.5 first:pt-1 flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-slate-900 truncate text-sm">{dev.name}</p>
                    <p className="text-xs text-slate-500">
                      {dev.barcode && <span className="font-mono mr-1">{dev.barcode}</span>}
                      {dev.location || [dev.manufacturer, dev.model].filter(Boolean).join(' / ')}
                    </p>
                    <p className="text-xs text-blue-900 font-medium">
                      予定: {formatYmd(plannedDate)}
                      {isPast && <span className="text-amber-700 ml-1">（過ぎています）</span>}
                      {lastInspection && (
                        <span className="text-slate-500 font-normal ml-1">
                          · 前回: {formatYmd(lastInspection)}
                        </span>
                      )}
                    </p>
                  </div>
                  <Link
                    href={maintenanceInspectionHref(dev)}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'sm' }),
                      'shrink-0 h-8 text-xs px-3 border-blue-200 text-blue-900',
                    )}
                  >
                    点検へ
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function StalePanel({
  loading,
  entries,
  meta,
}: {
  loading: boolean
  entries: PeriodicInspectionEntry[]
  meta: PeriodicInspectionListMeta
}) {
  return (
    <div className="flex flex-col rounded-xl border-l-4 border-l-amber-500 bg-amber-50/35 border border-amber-100 shadow-sm overflow-hidden min-h-[12rem]">
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-50/80 border-b border-amber-100">
        <span className="flex items-center gap-2 text-sm font-semibold text-amber-950 min-w-0">
          <CalendarClock className="h-4 w-4 text-amber-700 shrink-0" />
          <span className="truncate">期限超過・未実施</span>
        </span>
        <Badge variant="outline" className="border-amber-300 text-amber-900 bg-white text-[10px] shrink-0">
          {loading ? '…' : `${entries.length} 件`}
        </Badge>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 max-h-[min(50vh,20rem)]">
        {loading ? (
          <p className="text-sm text-amber-900/70 py-2">読み込み中…</p>
        ) : entries.length === 0 ? (
          <div className="text-sm text-amber-900/70 py-2 space-y-1.5">
            <p>期限超過・未実施の機器はありません。</p>
            {meta.periodicMasterCount === 0 && (
              <p className="text-[11px] text-amber-800/80">
                定期点検マスタ未登録。
                <Link href="/maintenance/master" className="underline ml-1">
                  マスタ画面
                </Link>
                でメーカー・型式マスタを登録してください。
              </p>
            )}
            {meta.periodicMasterCount > 0 && meta.activeDeviceCount === 0 && (
              <p className="text-[11px] text-amber-800/80">
                稼働中（利用中）の機器がありません。機器台帳のステータスを確認してください。
              </p>
            )}
            {meta.periodicMasterCount > 0 && meta.activeDeviceCount > 0 && (
              <p className="text-[11px] text-amber-800/80">
                機器台帳の「メーカー」「型式」と定期点検マスタの値が一致しているか確認してください。
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-amber-100 text-sm">
            {entries.map(({ device: dev, lastInspection, intervalMonths, plannedDate: dueDate }) => (
              <li key={dev.id} className="py-2.5 first:pt-1 flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-slate-900 truncate text-sm">{dev.name}</p>
                  <p className="text-xs text-slate-500">
                    {dev.barcode && <span className="font-mono mr-1">{dev.barcode}</span>}
                    {[dev.manufacturer, dev.model].filter(Boolean).join(' / ')}
                  </p>
                  <p className="text-xs text-amber-900 font-medium">
                    {intervalMonthsLabel(intervalMonths)}サイクル
                    {lastInspection === null ? (
                      dueDate ? (
                        <> · 次回予定: {formatYmd(dueDate)}（未点検）</>
                      ) : (
                        <> · 点検記録なし</>
                      )
                    ) : (
                      <>
                        {' '}
                        · 最終: {formatYmd(lastInspection)}
                        {dueDate && (
                          <>
                            {' '}
                            · 期限: {formatYmd(dueDate)}
                            （
                            {differenceInCalendarDays(
                              startOfDay(new Date()),
                              startOfDay(parse(dueDate, 'yyyy-MM-dd', new Date())),
                            )}
                            日超過）
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <Link
                  href={maintenanceInspectionHref(dev)}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'shrink-0 h-8 text-xs px-3 border-amber-200 text-amber-900',
                  )}
                >
                  点検へ
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function PeriodicInspectionDueList({ className }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [dueThisMonth, setDueThisMonth] = useState<PeriodicInspectionEntry[]>([])
  const [stale, setStale] = useState<PeriodicInspectionEntry[]>([])
  const [meta, setMeta] = useState<PeriodicInspectionListMeta>({
    periodicMasterCount: 0,
    activeDeviceCount: 0,
  })
  const [loading, setLoading] = useState(true)

  const monthLabel = format(new Date(), 'yyyy年M月', { locale: ja })

  const fetchList = useCallback(async () => {
    setLoading(true)
    const [devRes, recRes, masRes] = await Promise.all([
      supabase.from('devices').select('*'),
      supabase
        .from('maintenance_records')
        .select('device_id, completed_date')
        .eq('type', '定期点検')
        .not('completed_date', 'is', null),
      supabase.from('maintenance_model_masters').select('*'),
    ])

    const { dueThisMonth: due, stale: overdue, meta: listMeta } = mapPeriodicInspectionRows(
      devRes.data ?? [],
      masRes.data as Record<string, unknown>[] | null,
      recRes.data,
    )

    setDueThisMonth(due)
    setStale(overdue)
    setMeta(listMeta)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void fetchList()
    const channel = supabase
      .channel('periodic-inspection-due')
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

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void fetchList()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          一覧を更新
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <DueThisMonthPanel
          loading={loading}
          entries={dueThisMonth}
          meta={meta}
          monthLabel={monthLabel}
        />
        <StalePanel loading={loading} entries={stale} meta={meta} />
      </div>
    </div>
  )
}
