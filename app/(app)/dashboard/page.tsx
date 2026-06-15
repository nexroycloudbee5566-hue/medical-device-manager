'use client'

import { useEffect, useState, useCallback, useMemo, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  type Device,
  type Request,
  type RequestType,
  getStatusList,
  normalizeDeviceStatus,
} from '@/lib/types'

import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { REQUEST_STATUS_COLORS } from '@/components/requests/request-card'
import { DashboardMessages } from '@/components/dashboard/dashboard-messages'
import { DailyInspectionTodayList } from '@/components/maintenance/daily-inspection-today-list'
import {
  RefreshCw,
  ShoppingCart,
  Hammer,
  CalendarClock,
  CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  deviceHasInspectionMaster,
  filterPeriodicMasters,
  mapMaintenanceModelMasterRow,
} from '@/lib/maintenance-master'
import { deviceEligibleForAnnualPlan } from '@/lib/annual-maintenance-plan'
import { maintenanceInspectionHref } from '@/lib/maintenance-inspection-url'
import { intervalMonthsLabel, formatMonthsPastDueLabel } from '@/lib/inspection-interval'
import { mapPeriodicInspectionRows } from '@/lib/periodic-inspection-lists'

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

function requestProgressPct(
  type: RequestType,
  status: string,
  repairRoute?: Request['repair_route'],
): number {
  const statusList = getStatusList(type, repairRoute)
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

function formatYmdShort(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  return ymd.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')
}

function DashboardPanel({
  title,
  icon: Icon,
  iconClass,
  borderClass,
  headerBg,
  badge,
  headerExtra,
  children,
  className,
}: {
  title: string
  icon: ComponentType<{ className?: string }>
  iconClass: string
  borderClass: string
  headerBg: string
  badge?: ReactNode
  headerExtra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-h-0 flex flex-col rounded-lg border-l-4 shadow-sm overflow-hidden border border-slate-200/80',
        borderClass,
        className,
      )}
    >
      <div
        className={cn(
          'shrink-0 flex items-center justify-between gap-1.5 px-2.5 py-1.5 border-b',
          headerBg,
        )}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 min-w-0">
          <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} />
          <span className="truncate">{title}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {badge}
          {headerExtra}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1">{children}</div>
    </div>
  )
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [inspectionStale, setInspectionStale] = useState<InspectionListEntry[]>([])
  const [inspectionDueThisMonth, setInspectionDueThisMonth] = useState<InspectionListEntry[]>([])
  const [diag, setDiag] = useState({
    masterCount: -1,
    periodicMasterCount: 0,
    dailyMasterCount: 0,
    activeDeviceCount: 0,
    eligibleDeviceCount: 0,
    noItemsDeviceCount: 0,
    masterDetails: [] as { manufacturer: string; model: string; master_type: string; itemCount: number }[],
    deviceDetails: [] as { name: string; status: string; manufacturer: string; model: string; eligible: boolean; reason: string }[],
    queryErrors: [] as string[],
  })
  const [diagOpen, setDiagOpen] = useState(false)

  const fetchInspectionLists = useCallback(async () => {
    const [devRes, recRes, masRes] = await Promise.all([
      // select('*') で全カラム取得（存在しないカラム指定エラーを回避）
      supabase.from('devices').select('*'),
      supabase
        .from('maintenance_records')
        .select('device_id, completed_date')
        .eq('type', '定期点検')
        .not('completed_date', 'is', null),
      supabase.from('maintenance_model_masters').select('*'),
    ])

    const queryErrors: string[] = []
    if (devRes.error)   { console.error('[dashboard] devices error:', devRes.error);   queryErrors.push(`devices: ${devRes.error.message}`) }
    if (recRes.error)   { console.error('[dashboard] records error:', recRes.error);   queryErrors.push(`records: ${recRes.error.message}`) }
    if (masRes.error)   { console.error('[dashboard] masters error:', masRes.error);   queryErrors.push(`masters: ${masRes.error.message}`) }

    // disposed / inactive を JS 側で除外
    const devices    = (devRes.data ?? []).filter((d: { status: string }) => {
      const s = normalizeDeviceStatus(d.status)
      return s !== 'disposed'
    })
    const records    = recRes.data
    const mastersRaw = masRes.data

    const allMasters = (mastersRaw ?? []).map((row) =>
      mapMaintenanceModelMasterRow(row as Record<string, unknown>),
    )

    console.log('[dashboard] マスタ件数:', allMasters.length,
      'periodic:', filterPeriodicMasters(allMasters).length,
      'daily:', allMasters.filter((m) => m.master_type === 'daily').length)
    console.log('[dashboard] 全マスタ一覧:', allMasters.map((m) =>
      `[${m.master_type}] ${m.manufacturer}|${m.model} items=${m.checklist_items.length}`))

    const masters = filterPeriodicMasters(allMasters)
    const allDevices = (devices ?? []) as (InspectionDeviceRow & { status: string })[]

    const { dueThisMonth: dueMonth, stale } = mapPeriodicInspectionRows(
      allDevices,
      mastersRaw as Record<string, unknown>[] | null,
      records,
    )

    const eligibleCount = allDevices.filter((d) => deviceEligibleForAnnualPlan(masters, d)).length
    const noItemsCount = allDevices.filter((d) => {
      if (!deviceEligibleForAnnualPlan(masters, d)) return false
      return !deviceHasInspectionMaster(masters, d)
    }).length

    setInspectionDueThisMonth(dueMonth)
    setInspectionStale(stale)
    setDiag({
      masterCount: allMasters.length,
      periodicMasterCount: filterPeriodicMasters(allMasters).length,
      dailyMasterCount: allMasters.filter((m) => m.master_type === 'daily').length,
      activeDeviceCount: allDevices.filter((d) => normalizeDeviceStatus(d.status) === 'active').length,
      eligibleDeviceCount: eligibleCount,
      noItemsDeviceCount: noItemsCount,
      queryErrors,
      masterDetails: allMasters.map((m) => ({
        manufacturer: m.manufacturer,
        model: m.model,
        master_type: m.master_type,
        itemCount: m.checklist_items.length,
      })),
      deviceDetails: allDevices.map((d) => {
        const eligible = deviceEligibleForAnnualPlan(masters, d)
        const normalStatus = normalizeDeviceStatus(d.status)
        const reason = !eligible
          ? normalStatus !== 'active'
            ? `status=${d.status}(利用中以外)`
            : !d.model
              ? 'model未設定'
              : `マスタ不一致`
          : !deviceHasInspectionMaster(masters, d)
            ? '点検項目0件'
            : 'OK'
        return { name: d.name, status: d.status, manufacturer: d.manufacturer ?? '', model: d.model ?? '', eligible, reason }
      }),
    })
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
    <div className="h-full min-h-0 flex flex-col overflow-hidden p-2 gap-1.5 max-w-3xl mx-auto w-full">

      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 shrink-0">
        <h1 className="text-base font-bold text-slate-800">ダッシュボード</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            依頼 {requests.length}
          </Badge>
          <Badge className="text-[10px] h-5 px-1.5 bg-orange-100 text-orange-800 border-0 hover:bg-orange-100">
            修理 {repairList.length}
          </Badge>
          <Badge className="text-[10px] h-5 px-1.5 bg-green-100 text-green-800 border-0 hover:bg-green-100">
            購入 {purchaseList.length}
          </Badge>
          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={fetchRequests}>
            <RefreshCw className="h-3 w-3 mr-1" />
            更新
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 text-slate-500 border-dashed"
            onClick={() => setDiagOpen((v) => !v)}
          >
            診断
          </Button>
        </div>
      </div>

      <DashboardMessages compact />

      {/* ── 診断パネル ── */}
      {diagOpen && (
        <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs space-y-2 overflow-auto max-h-48">
          <p className="font-bold text-amber-900">データ診断（表示されない原因を確認）</p>
          {diag.queryErrors.length > 0 && (
            <div className="rounded border border-red-300 bg-red-50 p-2 space-y-1">
              <p className="font-bold text-red-800">⚠ クエリエラー（これが原因の可能性大）:</p>
              {diag.queryErrors.map((e, i) => (
                <p key={i} className="text-red-700 font-mono text-[11px] break-all">{e}</p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white rounded border border-amber-200 p-2">
              <p className="text-[10px] text-slate-500">マスタ合計</p>
              <p className="font-bold text-lg">{diag.masterCount < 0 ? '読込中' : diag.masterCount}</p>
            </div>
            <div className="bg-white rounded border border-amber-200 p-2">
              <p className="text-[10px] text-slate-500">定期点検マスタ</p>
              <p className={`font-bold text-lg ${diag.periodicMasterCount === 0 ? 'text-red-600' : 'text-green-700'}`}>{diag.periodicMasterCount}</p>
            </div>
            <div className="bg-white rounded border border-amber-200 p-2">
              <p className="text-[10px] text-slate-500">利用中機器</p>
              <p className={`font-bold text-lg ${diag.activeDeviceCount === 0 ? 'text-red-600' : 'text-green-700'}`}>{diag.activeDeviceCount}</p>
            </div>
            <div className="bg-white rounded border border-amber-200 p-2">
              <p className="text-[10px] text-slate-500">マスタ一致機器</p>
              <p className={`font-bold text-lg ${diag.eligibleDeviceCount === 0 ? 'text-red-600' : 'text-green-700'}`}>{diag.eligibleDeviceCount}</p>
              {diag.noItemsDeviceCount > 0 && (
                <p className="text-[10px] text-orange-600">うち{diag.noItemsDeviceCount}件は点検項目0</p>
              )}
            </div>
          </div>

          {diag.masterDetails.length > 0 && (
            <div>
              <p className="font-semibold text-amber-800 mb-1">登録マスタ一覧:</p>
              <div className="space-y-0.5">
                {diag.masterDetails.map((m, i) => (
                  <div key={i} className={`flex items-center gap-2 ${m.itemCount === 0 ? 'text-red-700' : 'text-slate-700'}`}>
                    <span className={`px-1 rounded text-[10px] ${m.master_type === 'daily' ? 'bg-teal-100' : 'bg-blue-100'}`}>{m.master_type === 'daily' ? '日常' : '定期'}</span>
                    <span>{m.manufacturer || '(メーカー未設定)'} / {m.model || '(型式未設定)'}</span>
                    <span className={m.itemCount === 0 ? 'text-red-600 font-bold' : ''}>点検項目: {m.itemCount}件{m.itemCount === 0 ? ' ⚠点検項目なし' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diag.deviceDetails.length > 0 && (
            <div>
              <p className="font-semibold text-amber-800 mb-1">機器マッチング結果:</p>
              <div className="space-y-0.5">
                {diag.deviceDetails.map((d, i) => (
                  <div key={i} className={`flex items-center gap-2 ${d.eligible && d.reason === 'OK' ? 'text-green-700' : 'text-red-700'}`}>
                    <span>{d.eligible && d.reason === 'OK' ? '✓' : '✗'}</span>
                    <span className="font-medium">{d.name}</span>
                    <span className="text-slate-500">({d.manufacturer || '–'} / {d.model || '未設定'})</span>
                    <span className={d.reason === 'OK' ? 'text-green-600' : 'text-red-600 font-semibold'}>{d.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── メイングリッド（2列・画面内スクロール） ── */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-1.5">

        {/* 左: 点検 */}
        <div className="min-h-0 flex flex-col gap-1.5">
          <DailyInspectionTodayList compact fill className="flex-[0.75] min-h-0" />

          <DashboardPanel
            className="flex-1 min-h-0 bg-blue-50/30 border-l-blue-500"
            title={`${currentMonthLabel}の定期点検`}
            icon={CalendarDays}
            iconClass="text-blue-700"
            borderClass="border-l-blue-500"
            headerBg="bg-blue-50/80 border-blue-100"
            badge={
              <Badge variant="outline" className="border-blue-300 text-blue-900 bg-white text-[9px] h-4 px-1">
                {loading ? '…' : `${inspectionDueThisMonth.length}`}
              </Badge>
            }
            headerExtra={
              <Link href="/maintenance/annual" className="text-[9px] text-blue-700 underline">
                計画
              </Link>
            }
          >
            {loading ? (
              <p className="text-[11px] text-blue-900/70 py-1">読み込み中…</p>
            ) : inspectionDueThisMonth.length === 0 ? (
              <p className="text-[11px] text-blue-900/70 py-1">今月予定なし</p>
            ) : (
              <ul className="divide-y divide-blue-100">
                {inspectionDueThisMonth.map(({ device: dev, lastInspection, plannedDate }) => (
                  <li key={dev.id} className="py-1 flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate text-[11px]">{dev.name}</p>
                      <p className="text-[9px] text-blue-900 truncate">
                        {formatYmdShort(plannedDate)}
                        {lastInspection && (
                          <span className="text-slate-500"> · {formatYmdShort(lastInspection)}</span>
                        )}
                      </p>
                    </div>
                    <Link
                      href={maintenanceInspectionHref(dev)}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 h-5 text-[9px] px-1.5')}
                    >
                      点検
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardPanel>

          <DashboardPanel
            className="flex-1 min-h-0 bg-amber-50/30 border-l-amber-500"
            title="期限超過・未実施"
            icon={CalendarClock}
            iconClass="text-amber-700"
            borderClass="border-l-amber-500"
            headerBg="bg-amber-50/80 border-amber-100"
            badge={
              <Badge variant="outline" className="border-amber-300 text-amber-900 bg-white text-[9px] h-4 px-1">
                {loading ? '…' : `${inspectionStale.length}`}
              </Badge>
            }
          >
            {loading ? (
              <p className="text-[11px] text-amber-900/70 py-1">読み込み中…</p>
            ) : inspectionStale.length === 0 ? (
              <p className="text-[11px] text-amber-900/70 py-1">該当なし</p>
            ) : (
              <ul className="divide-y divide-amber-100">
                {inspectionStale.map(({ device: dev, lastInspection, intervalMonths, plannedDate: dueDate }) => (
                  <li key={dev.id} className="py-1 flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate text-[11px]">{dev.name}</p>
                      <p className="text-[9px] text-amber-900 truncate">
                        {intervalMonthsLabel(intervalMonths)}
                        {dueDate && (
                          <>
                            {' '}
                            · {formatYmdShort(dueDate)}
                            {formatMonthsPastDueLabel(dueDate) && (
                              <span> ({formatMonthsPastDueLabel(dueDate)})</span>
                            )}
                          </>
                        )}
                        {lastInspection === null && !dueDate && ' · 未点検'}
                      </p>
                    </div>
                    <Link
                      href={maintenanceInspectionHref(dev)}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 h-5 text-[9px] px-1.5')}
                    >
                      点検
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardPanel>
        </div>

        {/* 右: 依頼 */}
        <div className="min-h-0 flex flex-col gap-1.5">
          <DashboardPanel
            className="flex-1 min-h-0 bg-white"
            title="修理依頼"
            icon={Hammer}
            iconClass="text-orange-600"
            borderClass="border-l-orange-500"
            headerBg="bg-orange-50/60 border-orange-100"
            headerExtra={
              <Link
                href="/requests/repair"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-5 text-[9px] px-1.5')}
              >
                一覧
              </Link>
            }
          >
            {repairList.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-3">進行中なし</p>
            ) : (
              <div className="space-y-1.5">
                {repairGroups.map((g) => (
                  <div key={g.key} className="rounded border border-slate-100 overflow-hidden">
                    <div className="px-2 py-1 bg-orange-50/60 border-b border-orange-100">
                      <p className="text-[10px] font-semibold text-slate-800 truncate">{g.label}</p>
                    </div>
                    <div className="px-2 py-1 space-y-1">
                      {g.requests.map((req) => {
                        const pct = requestProgressPct('repair', req.status, req.repair_route)
                        return (
                          <div key={req.id}>
                            <div className="flex items-center justify-between gap-1">
                              <Badge
                                className={`text-[9px] font-medium border-0 h-4 px-1 ${REQUEST_STATUS_COLORS[req.status] ?? 'bg-slate-100 text-slate-700'}`}
                              >
                                {req.status}
                              </Badge>
                              <span className="text-[9px] text-slate-400 tabular-nums">{pct}%</span>
                            </div>
                            <div className="h-0.5 bg-slate-200 rounded-full overflow-hidden mt-0.5">
                              <div className="h-full bg-orange-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardPanel>

          <DashboardPanel
            className="flex-1 min-h-0 bg-white"
            title="購入依頼"
            icon={ShoppingCart}
            iconClass="text-green-600"
            borderClass="border-l-green-500"
            headerBg="bg-green-50/60 border-green-100"
            headerExtra={
              <Link
                href="/requests/purchase"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-5 text-[9px] px-1.5')}
              >
                一覧
              </Link>
            }
          >
            {purchaseList.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-3">進行中なし</p>
            ) : (
              <div className="space-y-1.5">
                {purchaseGroups.map((g) => (
                  <div key={g.key} className="rounded border border-slate-100 overflow-hidden">
                    <div className="px-2 py-1 bg-green-50/60 border-b border-green-100">
                      <p className="text-[10px] font-semibold text-slate-800 truncate">{g.label}</p>
                    </div>
                    <div className="px-2 py-1 space-y-1">
                      {g.requests.map((req) => {
                        const pct = requestProgressPct('purchase', req.status)
                        return (
                          <div key={req.id}>
                            <div className="flex items-center justify-between gap-1">
                              <Badge
                                className={`text-[9px] font-medium border-0 h-4 px-1 ${REQUEST_STATUS_COLORS[req.status] ?? 'bg-slate-100 text-slate-700'}`}
                              >
                                {req.status}
                              </Badge>
                              <span className="text-[9px] text-slate-400 tabular-nums">{pct}%</span>
                            </div>
                            <div className="h-0.5 bg-slate-200 rounded-full overflow-hidden mt-0.5">
                              <div className="h-full bg-green-600 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardPanel>
        </div>
      </div>
    </div>
  )
}
