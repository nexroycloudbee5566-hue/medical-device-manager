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
  normalizeDeviceStatus,
} from '@/lib/types'
import { getRequestMeNo } from '@/lib/request-display'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { REQUEST_STATUS_COLORS } from '@/components/requests/request-card'
import {
  RefreshCw,
  Wrench,
  ShoppingCart,
  Hammer,
  ChevronRight,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { differenceInCalendarDays, format, parse, startOfDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  deviceHasInspectionMaster,
  filterPeriodicMasters,
  mapMaintenanceModelMasterRow,
} from '@/lib/maintenance-master'
import { deviceEligibleForAnnualPlan } from '@/lib/annual-maintenance-plan'
import { dailyInspectionHref, maintenanceInspectionHref } from '@/lib/maintenance-inspection-url'
import {
  buildDailyInspectionEntries,
  DAILY_INSPECTION_RECORD_TYPE,
  type DailyInspectionEntry,
} from '@/lib/daily-inspection'
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

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [inspectionStale, setInspectionStale] = useState<InspectionListEntry[]>([])
  const [inspectionDueThisMonth, setInspectionDueThisMonth] = useState<InspectionListEntry[]>([])
  const [dailyInspections, setDailyInspections] = useState<DailyInspectionEntry[]>([])
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
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const [devRes, recRes, dailyRes, masRes] = await Promise.all([
      // select('*') で全カラム取得（存在しないカラム指定エラーを回避）
      supabase.from('devices').select('*'),
      supabase
        .from('maintenance_records')
        .select('device_id, completed_date')
        .eq('type', '定期点検')
        .not('completed_date', 'is', null),
      supabase
        .from('maintenance_records')
        .select('device_id, completed_date')
        .eq('type', DAILY_INSPECTION_RECORD_TYPE)
        .gte('completed_date', todayStr)
        .lte('completed_date', todayStr),
      supabase.from('maintenance_model_masters').select('*'),
    ])

    const queryErrors: string[] = []
    if (devRes.error)   { console.error('[dashboard] devices error:', devRes.error);   queryErrors.push(`devices: ${devRes.error.message}`) }
    if (recRes.error)   { console.error('[dashboard] records error:', recRes.error);   queryErrors.push(`records: ${recRes.error.message}`) }
    if (dailyRes.error) { console.error('[dashboard] daily error:', dailyRes.error);   queryErrors.push(`daily: ${dailyRes.error.message}`) }
    if (masRes.error)   { console.error('[dashboard] masters error:', masRes.error);   queryErrors.push(`masters: ${masRes.error.message}`) }

    // disposed / inactive を JS 側で除外
    const devices    = (devRes.data ?? []).filter((d: { status: string }) => {
      const s = normalizeDeviceStatus(d.status)
      return s !== 'disposed'
    })
    const records    = recRes.data
    const dailyRecords = dailyRes.data
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
    const allDevices = (devices ?? []) as (InspectionDeviceRow & { status: string })[]

    console.log('[dashboard] 機器件数(廃棄・休止除く):', allDevices.length,
      '/ active:', allDevices.filter((d) => normalizeDeviceStatus(d.status) === 'active').length)
    console.log('[dashboard] 機器一覧:', allDevices.map((d) =>
      `${d.name}|status=${d.status}(→${normalizeDeviceStatus(d.status)})|${d.manufacturer}|${d.model}`))

    for (const dev of allDevices) {
      const eligible = deviceEligibleForAnnualPlan(masters, dev)
      if (!eligible) {
        const normalStatus = normalizeDeviceStatus(dev.status)
        const reason = normalStatus !== 'active'
          ? `status=${dev.status}(${normalStatus})`
          : !dev.model
            ? 'model未設定'
            : `マスタ不一致(${dev.manufacturer}|${dev.model})`
        console.log(`[dashboard] スキップ: ${dev.name} → ${reason}`)
        continue
      }

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

      const hasItems = deviceHasInspectionMaster(masters, dev)
      const staleFlag = isInspectionStale(last, intervalMonths, dev.next_maintenance_due, today)
      const monthFlag = isPlannedInMonth(plannedDate, today) && !completedInspectionInMonth(last, today)
      console.log(`[dashboard] 対象: ${dev.name} | hasItems=${hasItems} stale=${staleFlag} dueThisMonth=${monthFlag} interval=${intervalMonths}ヶ月 last=${last ?? 'なし'} planned=${plannedDate ?? 'なし'}`)

      if (monthFlag) {
        dueMonth.push(entry)
      }

      if (
        normalizeDeviceStatus(dev.status) === 'active' &&
        hasItems &&
        staleFlag
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

    const completedToday = new Set<string>()
    for (const row of dailyRecords ?? []) {
      const did = row.device_id as string | null
      if (did) completedToday.add(did)
    }

    setDailyInspections(
      buildDailyInspectionEntries(
        (devices ?? []) as DailyInspectionEntry['device'][],
        allMasters,
        completedToday,
      ),
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
  const todayLabel = format(new Date(), 'yyyy年M月d日（E）', { locale: ja })
  const dailyPendingCount = dailyInspections.filter((e) => !e.completedToday).length
  const dailyDoneCount = dailyInspections.filter((e) => e.completedToday).length

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
    <div className="h-full flex flex-col p-3 gap-3 overflow-hidden">

      {/* ── ヘッダー行（サマリーチップ付き） ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <h1 className="text-xl font-bold text-slate-800">ダッシュボード</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400">進行中依頼</span>
          <Badge variant="secondary" className="text-xs">合計 {requests.length}</Badge>
          <Badge className="text-xs bg-orange-100 text-orange-800 border-0 hover:bg-orange-100">
            <Wrench className="h-3 w-3 mr-1" />修理 {repairList.length}
          </Badge>
          <Badge className="text-xs bg-green-100 text-green-800 border-0 hover:bg-green-100">
            <ShoppingCart className="h-3 w-3 mr-1" />購入 {purchaseList.length}
          </Badge>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={fetchRequests}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            更新
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-slate-500 border-dashed"
            onClick={() => setDiagOpen((v) => !v)}
          >
            🔍 診断
          </Button>
        </div>
      </div>

      {/* ── 診断パネル ── */}
      {diagOpen && (
        <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs space-y-2 overflow-auto max-h-80">
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

      {/* ── メイングリッド ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* ======= 左列: 点検パネル ======= */}
        <div className="flex flex-col gap-3 min-h-0">

          {/* 日常点検（常時展開） */}
          <div className="shrink-0 rounded-xl border-l-4 border-l-teal-500 bg-teal-50/35 border border-teal-100 shadow-sm overflow-hidden">
            <div className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-teal-50/80">
              <span className="flex items-center gap-2 text-sm font-semibold text-teal-950 min-w-0">
                <ClipboardCheck className="h-4 w-4 text-teal-700 shrink-0" />
                <span className="truncate">日常点検（{todayLabel}）</span>
              </span>
              <Badge variant="outline" className="border-teal-300 text-teal-900 bg-white text-[10px] shrink-0">
                {loading ? '…' : `未実施 ${dailyPendingCount} / ${dailyInspections.length}`}
              </Badge>
            </div>
            <div className="px-4 py-2 overflow-y-auto max-h-48">
                {loading ? (
                  <p className="text-sm text-teal-900/70 py-1">読み込み中…</p>
                ) : dailyInspections.length === 0 ? (
                  <div className="text-xs text-teal-900/70 py-1 space-y-1.5">
                    <p className="font-medium">本日の日常点検対象がありません。</p>
                    <ul className="space-y-0.5 text-[11px] text-teal-800/80">
                      {diag.dailyMasterCount === 0 && (
                        <li className="flex items-start gap-1">
                          <span className="shrink-0 text-red-500 mt-px">✗</span>
                          <span>
                            日常点検マスタ未登録 → 
                            <Link href="/maintenance/master" className="underline ml-1">マスタ画面の「日常点検」タブ</Link>
                            で登録してください
                          </span>
                        </li>
                      )}
                      {diag.dailyMasterCount > 0 && diag.activeDeviceCount === 0 && (
                        <li className="flex items-start gap-1">
                          <span className="shrink-0 text-amber-500 mt-px">!</span>
                          <span>稼働中（ステータス: 利用中）の機器がありません。機器台帳を確認してください。</span>
                        </li>
                      )}
                      {diag.dailyMasterCount > 0 && diag.activeDeviceCount > 0 && (
                        <li className="flex items-start gap-1">
                          <span className="shrink-0 text-amber-500 mt-px">!</span>
                          <span>機器台帳の「メーカー」「型式」と日常点検マスタの値が一致しているか確認してください。</span>
                        </li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <ul className="divide-y divide-teal-100 text-sm">
                    {dailyInspections.map(({ device: dev, items, completedToday }) => (
                      <li key={dev.id} className="py-2 first:pt-1 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-slate-900 truncate text-xs">{dev.name}</span>
                            <Badge className={cn('text-[9px] border-0 px-1 py-0',
                              completedToday ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')}>
                              {completedToday ? '完了' : '未実施'}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate">
                            {[dev.location, items.map(i => i.label).join('・')].filter(Boolean).join(' / ')}
                          </p>
                        </div>
                        <Link
                          href={dailyInspectionHref(dev)}
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }),
                            'shrink-0 h-6 text-[10px] px-2 border-teal-200 text-teal-900')}
                        >
                          {completedToday ? '再記録' : '点検へ'}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </div>

          {/* 今月の定期点検（flex-1、内部スクロール） */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border-l-4 border-l-blue-500 bg-blue-50/35 border border-blue-100 shadow-sm overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 bg-blue-50/80 border-b border-blue-100">
              <span className="flex items-center gap-2 text-sm font-semibold text-blue-950 min-w-0">
                <CalendarDays className="h-4 w-4 text-blue-700 shrink-0" />
                <span className="truncate">{currentMonthLabel}の定期点検</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="border-blue-300 text-blue-900 bg-white text-[10px]">
                  {loading ? '…' : `${inspectionDueThisMonth.length} 件`}
                </Badge>
                <Link href="/maintenance/annual" className="text-[10px] text-blue-700 underline">
                  年間計画
                </Link>
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading ? (
                <p className="text-sm text-blue-900/70 py-2">読み込み中…</p>
              ) : inspectionDueThisMonth.length === 0 ? (
                <div className="text-sm text-blue-900/70 py-2 space-y-1.5">
                  <p>今月予定の定期点検はありません。</p>
                  {diag.masterCount === 0 && (
                    <p className="text-[11px] text-blue-800/80">
                      ⚠ 定期点検マスタが0件です。
                      <Link href="/maintenance/master" className="underline ml-1">マスタ画面</Link>
                      で「定期点検」タブに機器を登録してください。
                    </p>
                  )}
                  {diag.periodicMasterCount > 0 && inspectionStale.length === 0 && (
                    <p className="text-[11px] text-blue-800/80">
                      期間超過・未実施も0件です。機器台帳の「メーカー」「型式」とマスタが一致しているか確認してください。
                    </p>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-blue-100 text-sm">
                  {inspectionDueThisMonth.map(({ device: dev, lastInspection, plannedDate }) => {
                    const planned = plannedDate ? parse(plannedDate, 'yyyy-MM-dd', new Date()) : null
                    const isPast = planned && startOfDay(planned) < startOfDay(new Date())
                    return (
                      <li key={dev.id} className="py-2 first:pt-1 flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium text-slate-900 truncate text-xs">{dev.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {dev.barcode && <span className="font-mono mr-1">{dev.barcode}</span>}
                            {dev.location || [dev.manufacturer, dev.model].filter(Boolean).join(' / ')}
                          </p>
                          <p className="text-[10px] text-blue-900 font-medium">
                            予定: {plannedDate?.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3') ?? '—'}
                            {isPast && <span className="text-amber-700 ml-1">（過ぎています）</span>}
                            {lastInspection && (
                              <span className="text-slate-500 font-normal ml-1">
                                · 前回: {lastInspection.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')}
                              </span>
                            )}
                          </p>
                        </div>
                        <Link
                          href={maintenanceInspectionHref(dev)}
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 h-6 text-[10px] px-2')}
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

          {/* 期間超過・未実施（flex-1、内部スクロール） */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border-l-4 border-l-amber-500 bg-amber-50/35 border border-amber-100 shadow-sm overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-50/80 border-b border-amber-100">
              <span className="flex items-center gap-2 text-sm font-semibold text-amber-950 min-w-0">
                <CalendarClock className="h-4 w-4 text-amber-700 shrink-0" />
                <span className="truncate">期間超過・未実施</span>
              </span>
              <Badge variant="outline" className="border-amber-300 text-amber-900 bg-white text-[10px] shrink-0">
                {loading ? '…' : `${inspectionStale.length} 件`}
              </Badge>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading ? (
                <p className="text-sm text-amber-900/70 py-2">読み込み中…</p>
              ) : inspectionStale.length === 0 ? (
                <div className="text-sm text-amber-900/70 py-2 space-y-1.5">
                  <p>期間超過・未実施の機器はありません。</p>
                  {diag.masterCount !== -1 && diag.periodicMasterCount === 0 && (
                    <p className="text-[11px] text-amber-800/80">
                      ⚠ 定期点検マスタ未登録。
                      <Link href="/maintenance/master" className="underline ml-1">マスタ画面</Link>
                      でメーカー・型式マスタを登録してください（点検項目が1件以上必要です）。
                    </p>
                  )}
                  {diag.periodicMasterCount > 0 && diag.activeDeviceCount === 0 && (
                    <p className="text-[11px] text-amber-800/80">
                      ⚠ 稼働中（利用中）の機器がありません。機器台帳のステータスを確認してください。
                    </p>
                  )}
                  {diag.periodicMasterCount > 0 && diag.activeDeviceCount > 0 && (
                    <p className="text-[11px] text-amber-800/80">
                      機器台帳の「メーカー」「型式」と定期点検マスタの値が一致しているか確認してください。
                    </p>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-amber-100 text-sm">
                  {inspectionStale.map(({ device: dev, lastInspection, intervalMonths, plannedDate: dueDate }) => (
                    <li key={dev.id} className="py-2 first:pt-1 flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium text-slate-900 truncate text-xs">{dev.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {dev.barcode && <span className="font-mono mr-1">{dev.barcode}</span>}
                          {[dev.manufacturer, dev.model].filter(Boolean).join(' / ')}
                        </p>
                        <p className="text-[10px] text-amber-900 font-medium">
                          {intervalMonthsLabel(intervalMonths)}サイクル
                          {lastInspection === null ? (
                            dueDate
                              ? <> · 次回予定: {dueDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')}（未点検）</>
                              : <> · 点検記録なし</>
                          ) : (
                            <>
                              {' '}· 最終: {lastInspection.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')}
                              {dueDate && (
                                <> · 期限: {dueDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')}
                                （{differenceInCalendarDays(startOfDay(new Date()), startOfDay(parse(dueDate, 'yyyy-MM-dd', new Date())))}日超過）</>
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      <Link
                        href={maintenanceInspectionHref(dev)}
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 h-6 text-[10px] px-2')}
                      >
                        点検へ
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ======= 右列: 依頼パネル ======= */}
        <div className="flex flex-col gap-3 min-h-0">

          {/* 修理依頼 */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 bg-orange-50/60 border-b border-orange-100">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Hammer className="h-4 w-4 text-orange-600 shrink-0" />
                修理依頼 — 機器別
              </span>
              <Link
                href="/requests/repair"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-6 text-[10px] px-2 gap-0.5')}
              >
                一覧へ <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {repairList.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">進行中の修理依頼はありません</p>
              ) : (
                <div className="space-y-2">
                  {repairGroups.map((g) => (
                    <div key={g.key} className="rounded-lg border border-slate-100 overflow-hidden">
                      <div className="px-3 py-2 bg-orange-50/60 border-b border-orange-100">
                        <p className="text-xs font-semibold text-slate-800 leading-snug">{g.label}</p>
                        <p className="text-[10px] text-slate-500">進行中 {g.requests.length} 件</p>
                      </div>
                      <div className="px-3 py-2 space-y-2">
                        {g.requests.map((req) => {
                          const pct = requestProgressPct('repair', req.status, req.repair_route)
                          const meNo = getRequestMeNo(req)
                          return (
                            <div key={req.id} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <Badge className={`text-[10px] font-medium border-0 ${REQUEST_STATUS_COLORS[req.status] ?? 'bg-slate-100 text-slate-700'}`}>
                                  {req.status}
                                </Badge>
                                <span className="text-[10px] text-slate-400 tabular-nums">{pct}%</span>
                              </div>
                              <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              {meNo && (
                                <p className="text-[10px] font-mono text-slate-500">ME No. {meNo}</p>
                              )}
                              <p className="text-[10px] text-slate-600 line-clamp-1">{req.description}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 購入依頼 */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 bg-green-50/60 border-b border-green-100">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ShoppingCart className="h-4 w-4 text-green-600 shrink-0" />
                購入依頼 — 依頼機器別
              </span>
              <Link
                href="/requests/purchase"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-6 text-[10px] px-2 gap-0.5')}
              >
                一覧へ <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {purchaseList.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">進行中の購入依頼はありません</p>
              ) : (
                <div className="space-y-2">
                  {purchaseGroups.map((g) => (
                    <div key={g.key} className="rounded-lg border border-slate-100 overflow-hidden">
                      <div className="px-3 py-2 bg-green-50/60 border-b border-green-100">
                        <p className="text-xs font-semibold text-slate-800 leading-snug">{g.label}</p>
                        <p className="text-[10px] text-slate-500">進行中 {g.requests.length} 件</p>
                      </div>
                      <div className="px-3 py-2 space-y-2">
                        {g.requests.map((req) => {
                          const pct = requestProgressPct('purchase', req.status)
                          return (
                            <div key={req.id} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <Badge className={`text-[10px] font-medium border-0 ${REQUEST_STATUS_COLORS[req.status] ?? 'bg-slate-100 text-slate-700'}`}>
                                  {req.status}
                                </Badge>
                                <span className="text-[10px] text-slate-400 tabular-nums">{pct}%</span>
                              </div>
                              <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-green-600 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <p className="text-[10px] text-slate-600 line-clamp-1">{req.description}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
