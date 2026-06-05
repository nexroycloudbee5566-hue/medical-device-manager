'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  type Device,
  type MaintenanceModelMaster,
  type Request,
  type RequestType,
  getStatusList,
} from '@/lib/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { REQUEST_STATUS_COLORS } from '@/components/requests/request-card'
import { RefreshCw, Wrench, ShoppingCart, Hammer, ChevronRight, CalendarClock, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { differenceInCalendarDays, format, parse, startOfDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  deviceHasInspectionMaster,
  filterPeriodicMasters,
  mapMaintenanceModelMasterRow,
} from '@/lib/maintenance-master'
import { deviceEligibleForAnnualPlan } from '@/lib/annual-maintenance-plan'
import { maintenanceInspectionHref } from '@/lib/maintenance-inspection-url'
import {
  derivePlannedDate,
  getIntervalMonthsForDevice,
  isInspectionStale,
  inspectionDueDate,
  intervalMonthsLabel,
  isPlannedInMonth,
  completedInspectionInMonth,
} from '@/lib/inspection-interval'

type InspectionDeviceRow = Pick<
  Device,
  'id' | 'name' | 'barcode' | 'manufacturer' | 'model' | 'next_maintenance_due' | 'location'
>

type InspectionListEntry = {
  device: InspectionDeviceRow
  lastInspection: string | null
  intervalMonths: number
  plannedDate: string | null
}

function requestProgressPct(type: RequestType, status: string): number {
  const statusList = getStatusList(type)
  const idx = statusList.indexOf(status as never)
  if (idx === -1) return 0
  return Math.round((idx / (statusList.length - 1)) * 100)
}

function repairGroupKey(r: Request): string {
  if (r.device_id) return `device:${r.device_id}`
  const t = (r.requested_equipment || '').trim()
  return t ? `text:${t}` : 'unknown'
}

function repairGroupLabel(r: Request): string {
  const dev = r.devices as { name?: string; barcode?: string } | undefined
  if (dev?.name) return `${dev.name}${dev.barcode ? ` [${dev.barcode}]` : ''}`
  const t = r.requested_equipment?.trim()
  if (t) return t
  return '機器未設定'
}

function purchaseGroupKey(r: Request): string {
  const t = (r.requested_equipment || '').trim()
  return t || '__empty__'
}

function purchaseGroupLabel(key: string): string {
  return key === '__empty__' ? '（依頼機器未入力）' : key
}

function groupRequests(
  list: Request[],
  type: RequestType,
): { key: string; label: string; requests: Request[] }[] {
  const map = new Map<string, Request[]>()
  for (const r of list) {
    const key =
      type === 'repair' ? repairGroupKey(r) : purchaseGroupKey(r)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  const out = [...map.entries()].map(([key, requests]) => ({
    key,
    label:
      type === 'repair'
        ? repairGroupLabel(requests[0])
        : purchaseGroupLabel(key),
    requests,
  }))
  out.sort((a, b) => a.label.localeCompare(b.label, 'ja'))
  return out
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [inspectionStale, setInspectionStale] = useState<InspectionListEntry[]>([])
  const [inspectionDueThisMonth, setInspectionDueThisMonth] = useState<InspectionListEntry[]>([])

  const fetchInspectionLists = useCallback(async () => {
    const [{ data: devices }, { data: records }, { data: mastersRaw }] = await Promise.all([
      supabase
        .from('devices')
        .select('id, name, barcode, manufacturer, model, next_maintenance_due, location, status')
        .not('status', 'eq', 'disposed')
        .not('status', 'eq', 'inactive'),
      supabase
        .from('maintenance_records')
        .select('device_id, completed_date')
        .eq('type', '定期点検')
        .not('completed_date', 'is', null),
      supabase.from('maintenance_model_masters').select('*'),
    ])

    const masters = filterPeriodicMasters(
      (mastersRaw ?? []).map((row) =>
        mapMaintenanceModelMasterRow(row as Record<string, unknown>),
      ),
    )

    const latestByDevice = new Map<string, string>()
    for (const row of records ?? []) {
      const did = row.device_id as string | null
      const cd = row.completed_date as string | null
      if (!did || !cd) continue
      const prev = latestByDevice.get(did)
      if (!prev || cd > prev) latestByDevice.set(did, cd.slice(0, 10))
    }

    const today = startOfDay(new Date())
    const stale: InspectionListEntry[] = []
    const dueMonth: InspectionListEntry[] = []

    for (const dev of (devices ?? []) as (InspectionDeviceRow & { status: string })[]) {
      if (!deviceEligibleForAnnualPlan(masters, dev)) continue

      const last = latestByDevice.get(dev.id) ?? null
      const intervalMonths = getIntervalMonthsForDevice(masters, dev.manufacturer, dev.model)
      const plannedDate = derivePlannedDate(
        dev.next_maintenance_due,
        last,
        intervalMonths,
      )

      const entry: InspectionListEntry = {
        device: dev,
        lastInspection: last,
        intervalMonths,
        plannedDate,
      }

      if (
        isPlannedInMonth(plannedDate, today) &&
        !completedInspectionInMonth(last, today)
      ) {
        dueMonth.push(entry)
      }

      if (
        dev.status === 'active' &&
        deviceHasInspectionMaster(masters, dev) &&
        isInspectionStale(last, intervalMonths, dev.next_maintenance_due, today)
      ) {
        const dueDate =
          dev.next_maintenance_due?.slice(0, 10) ?? inspectionDueDate(last, intervalMonths)
        stale.push({ ...entry, plannedDate: dueDate })
      }
    }

    const byPlanned = (a: InspectionListEntry, b: InspectionListEntry) =>
      (a.plannedDate ?? '9999-12-31').localeCompare(b.plannedDate ?? '9999-12-31')

    dueMonth.sort(byPlanned)
    stale.sort((a, b) => {
      if (a.lastInspection === null && b.lastInspection === null)
        return a.device.name.localeCompare(b.device.name, 'ja')
      if (a.lastInspection === null) return -1
      if (b.lastInspection === null) return 1
      return a.lastInspection.localeCompare(b.lastInspection)
    })

    setInspectionDueThisMonth(dueMonth)
    setInspectionStale(stale)
  }, [supabase])

  const fetchRequests = useCallback(async () => {
    const { data } = await supabase
      .from('requests')
      .select(
        'id, type, status, device_id, requested_equipment, description, devices(name, barcode)',
      )
      .neq('status', '完了')
    setRequests(((data ?? []) as unknown) as Request[])
    setLoading(false)
    void fetchInspectionLists()
  }, [supabase, fetchInspectionLists])

  useEffect(() => {
    fetchRequests()
    const channel = supabase
      .channel('dashboard-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, fetchRequests)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_records' },
        () => void fetchInspectionLists(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        () => void fetchInspectionLists(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_model_masters' },
        () => void fetchInspectionLists(),
      )
      .subscribe()
    void fetchInspectionLists()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchRequests, fetchInspectionLists, supabase])

  const currentMonthLabel = format(new Date(), 'yyyy年M月', { locale: ja })

  const repairList = useMemo(
    () => requests.filter((r) => r.type === 'repair'),
    [requests],
  )
  const purchaseList = useMemo(
    () => requests.filter((r) => r.type === 'purchase'),
    [requests],
  )

  const repairGroups = useMemo(
    () => groupRequests(repairList, 'repair'),
    [repairList],
  )
  const purchaseGroups = useMemo(
    () => groupRequests(purchaseList, 'purchase'),
    [purchaseList],
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ダッシュボード</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            進行中依頼を機器／依頼機器ごとに表示します
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          更新
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">進行中（合計）</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{requests.length}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl">
                <RefreshCw className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">修理依頼（進行中）</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{repairList.length}</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-xl">
                <Wrench className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">購入依頼（進行中）</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{purchaseList.length}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl">
                <ShoppingCart className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm border-l-4 border-l-blue-500 bg-blue-50/35 overflow-hidden">
        <CardHeader className="py-3 px-4 pb-2 flex flex-row items-start justify-between space-y-0 gap-3 bg-blue-50/80 border-b border-blue-100">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base font-semibold text-blue-950 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-700 shrink-0" />
              {currentMonthLabel}の定期点検
            </CardTitle>
            <p className="text-xs text-blue-900/75 font-normal leading-snug">
              次回点検予定が今月の機器です（今月すでに点検済みの機器は除きます）。
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className="border-blue-300 text-blue-900 bg-white">
              {loading ? '…' : `${inspectionDueThisMonth.length} 件`}
            </Badge>
            <Link
              href="/maintenance/annual"
              className="text-[10px] text-blue-700 underline"
            >
              年間計画へ
            </Link>
          </div>
        </CardHeader>
        <CardContent className="py-3 px-4">
          {loading ? (
            <p className="text-sm text-blue-900/70 py-2">読み込み中…</p>
          ) : inspectionDueThisMonth.length === 0 ? (
            <p className="text-sm text-blue-900/70 py-1">
              今月予定の定期点検はありません。
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-blue-100 text-sm">
              {inspectionDueThisMonth.map(({ device: dev, lastInspection, plannedDate }) => {
                const planned = plannedDate
                  ? parse(plannedDate, 'yyyy-MM-dd', new Date())
                  : null
                const isPast =
                  planned && startOfDay(planned) < startOfDay(new Date())
                return (
                  <li
                    key={dev.id}
                    className="py-2.5 first:pt-0 flex flex-wrap items-start justify-between gap-2"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-slate-900 truncate">{dev.name}</p>
                      <p className="text-xs text-slate-600">
                        {dev.barcode ? (
                          <span className="font-mono mr-2">{dev.barcode}</span>
                        ) : (
                          <span className="text-slate-400 mr-2">コードなし</span>
                        )}
                        {dev.location || [dev.manufacturer, dev.model].filter(Boolean).join(' / ') || null}
                      </p>
                      <p className="text-xs text-blue-900 font-medium">
                        予定日:{' '}
                        {plannedDate
                          ? plannedDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')
                          : '—'}
                        {isPast && (
                          <span className="text-amber-800 ml-1">（予定日を過ぎています）</span>
                        )}
                        {lastInspection && (
                          <span className="text-slate-500 font-normal ml-1">
                            · 前回:{' '}
                            {lastInspection.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')}
                          </span>
                        )}
                      </p>
                    </div>
                    <Link
                      href={maintenanceInspectionHref(dev)}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 h-7 text-xs')}
                    >
                      点検へ
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm border-l-4 border-l-amber-500 bg-amber-50/35 overflow-hidden">
        <CardHeader className="py-3 px-4 pb-2 flex flex-row items-start justify-between space-y-0 gap-3 bg-amber-50/80 border-b border-amber-100">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base font-semibold text-amber-950 flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-700 shrink-0" />
              定期点検（期間超過・未実施）
            </CardTitle>
            <p className="text-xs text-amber-900/75 font-normal leading-snug">
              ステータスが「利用中」の機器のうち、メンテナンスマスタ（点検項目あり）登録済みで点検期間超過などのものを表示します。
            </p>
          </div>
          <Badge variant="outline" className="border-amber-300 text-amber-900 bg-white shrink-0">
            {loading ? '…' : `${inspectionStale.length} 件`}
          </Badge>
        </CardHeader>
        <CardContent className="py-3 px-4">
          {loading ? (
            <p className="text-sm text-amber-900/70 py-2">読み込み中…</p>
          ) : inspectionStale.length === 0 ? (
            <p className="text-sm text-amber-900/70 py-1">
              点検期間内の機器のみです。期間超過の機器はありません。
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-amber-100 text-sm">
              {inspectionStale.map(({ device: dev, lastInspection, intervalMonths, plannedDate: dueDate }) => (
                <li key={dev.id} className="py-2.5 first:pt-0 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-slate-900 truncate">{dev.name}</p>
                    <p className="text-xs text-slate-600">
                      {dev.barcode ? (
                        <span className="font-mono mr-2">{dev.barcode}</span>
                      ) : (
                        <span className="text-slate-400 mr-2">コードなし</span>
                      )}
                      {[dev.manufacturer, dev.model].filter(Boolean).join(' / ') || null}
                    </p>
                    <p className="text-xs text-amber-900 font-medium">
                      点検期間: {intervalMonthsLabel(intervalMonths)}
                      {lastInspection === null ? (
                        dueDate ? (
                          <>
                            {' '}
                            · 次回予定:{' '}
                            {dueDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')}
                            （未点検・予定あり）
                          </>
                        ) : (
                          <> · 定期点検の記録がありません</>
                        )
                      ) : (
                        <>
                          {' '}
                          · 最終点検:{' '}
                          {lastInspection.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')}
                          {dueDate && (
                            <>
                              {' '}
                              · 期限:{' '}
                              {dueDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')}
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
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 h-7 text-xs')}
                  >
                    点検へ
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          読み込み中...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Hammer className="h-5 w-5 text-orange-600" />
                修理依頼 — 機器別
              </h2>
              <Link
                href="/requests/repair"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-0.5')}
              >
                一覧へ
                <ChevronRight className="h-4 w-4 ml-0.5" />
              </Link>
            </div>
            {repairList.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-8">
                  <p className="text-sm text-slate-400 text-center">
                    進行中の修理依頼はありません
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {repairGroups.map((g) => (
                  <Card key={g.key} className="border-0 shadow-sm overflow-hidden">
                    <CardHeader className="py-3 px-4 bg-orange-50/60 border-b border-orange-100">
                      <CardTitle className="text-sm font-semibold text-slate-800 leading-snug">
                        {g.label}
                      </CardTitle>
                      <p className="text-xs text-slate-500 font-normal">
                        進行中 {g.requests.length} 件
                      </p>
                    </CardHeader>
                    <CardContent className="py-3 px-4 space-y-3">
                      {g.requests.map((req) => {
                        const pct = requestProgressPct('repair', req.status)
                        return (
                          <div
                            key={req.id}
                            className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge
                                className={`text-xs font-medium border-0 ${REQUEST_STATUS_COLORS[req.status] ?? 'bg-slate-100 text-slate-700'}`}
                              >
                                {req.status}
                              </Badge>
                              <span className="text-xs text-slate-500 tabular-nums">{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-orange-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-2">{req.description}</p>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-green-600" />
                購入依頼 — 依頼機器別
              </h2>
              <Link
                href="/requests/purchase"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-0.5')}
              >
                一覧へ
                <ChevronRight className="h-4 w-4 ml-0.5" />
              </Link>
            </div>
            {purchaseList.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-8">
                  <p className="text-sm text-slate-400 text-center">
                    進行中の購入依頼はありません
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {purchaseGroups.map((g) => (
                  <Card key={g.key} className="border-0 shadow-sm overflow-hidden">
                    <CardHeader className="py-3 px-4 bg-green-50/60 border-b border-green-100">
                      <CardTitle className="text-sm font-semibold text-slate-800 leading-snug">
                        {g.label}
                      </CardTitle>
                      <p className="text-xs text-slate-500 font-normal">
                        進行中 {g.requests.length} 件
                      </p>
                    </CardHeader>
                    <CardContent className="py-3 px-4 space-y-3">
                      {g.requests.map((req) => {
                        const pct = requestProgressPct('purchase', req.status)
                        return (
                          <div
                            key={req.id}
                            className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge
                                className={`text-xs font-medium border-0 ${REQUEST_STATUS_COLORS[req.status] ?? 'bg-slate-100 text-slate-700'}`}
                              >
                                {req.status}
                              </Badge>
                              <span className="text-xs text-slate-500 tabular-nums">{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-600 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-2">{req.description}</p>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-center pt-2">
        <Link href="/requests/repair" className={cn(buttonVariants(), 'inline-flex items-center')}>
          <Hammer className="h-4 w-4 mr-2" />
          修理依頼を開く
        </Link>
        <Link
          href="/requests/purchase"
          className={cn(buttonVariants({ variant: 'secondary' }), 'inline-flex items-center')}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          購入依頼を開く
        </Link>
      </div>
    </div>
  )
}
