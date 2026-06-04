'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Device, Hospital } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  CalendarRange,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { mapMaintenanceModelMasterRow } from '@/lib/maintenance-master'
import {
  buildAnnualPlanItems,
  groupPlanByMonth,
  summarizeAnnualPlan,
  type AnnualPlanItem,
  type AnnualPlanStatus,
} from '@/lib/annual-maintenance-plan'

const STATUS_CHIP: Record<AnnualPlanStatus, string> = {
  completed: 'bg-green-50 text-green-800 border-green-200',
  overdue: 'bg-red-50 text-red-800 border-red-200',
  due_this_month: 'bg-amber-50 text-amber-900 border-amber-200',
  scheduled: 'bg-blue-50 text-blue-800 border-blue-100',
  unscheduled: 'bg-slate-50 text-slate-600 border-slate-200',
}

type BoardColumn = {
  key: string
  title: string
  subtitle?: string
  headerClass?: string
  items: AnnualPlanItem[]
}

const STATUS_LABEL: Record<AnnualPlanStatus, string> = {
  completed: '完了',
  overdue: '期限超過',
  due_this_month: '今月',
  scheduled: '予定',
  unscheduled: '未設定',
}

function sortByBarcode(items: AnnualPlanItem[]): AnnualPlanItem[] {
  return [...items].sort((a, b) => {
    const ba = (a.barcode ?? '').localeCompare(b.barcode ?? '', 'ja')
    if (ba !== 0) return ba
    return a.name.localeCompare(b.name, 'ja')
  })
}

function PlanChip({ item }: { item: AnnualPlanItem }) {
  const label = item.barcode?.trim() || item.name
  return (
    <Link
      href="/maintenance"
      title={[item.name, item.plannedDate, STATUS_LABEL[item.status]].filter(Boolean).join(' · ')}
      className={cn(
        'block rounded border px-1.5 py-1 text-xs font-mono leading-tight hover:opacity-90 transition-opacity',
        STATUS_CHIP[item.status],
      )}
    >
      {label}
    </Link>
  )
}

function AnnualPlanBoard({
  overdue,
  months,
  unscheduled,
  year,
  totalPlanItems,
}: {
  overdue: AnnualPlanItem[]
  months: { month: number; label: string; items: AnnualPlanItem[] }[]
  unscheduled: AnnualPlanItem[]
  year: number
  totalPlanItems: number
}) {
  const currentMonth = new Date().getMonth() + 1

  const columns: BoardColumn[] = useMemo(() => {
    const cols: BoardColumn[] = []
    if (overdue.length > 0) {
      cols.push({
        key: 'overdue',
        title: '期限超過',
        headerClass: 'bg-red-100 text-red-900 border-red-200',
        items: sortByBarcode(overdue),
      })
    }
    for (const g of months) {
      cols.push({
        key: `m-${g.month}`,
        title: g.label,
        subtitle: `${year}`,
        headerClass:
          g.month === currentMonth
            ? 'bg-blue-100 text-blue-900 border-blue-200'
            : 'bg-slate-100 text-slate-800 border-slate-200',
        items: sortByBarcode(g.items),
      })
    }
    if (unscheduled.length > 0) {
      cols.push({
        key: 'unscheduled',
        title: '未設定',
        headerClass: 'bg-slate-200 text-slate-700 border-slate-300',
        items: sortByBarcode(unscheduled),
      })
    }
    return cols
  }, [overdue, months, unscheduled, year, currentMonth])

  if (totalPlanItems === 0) {
    return (
      <div className="text-sm text-slate-500 text-center py-12 space-y-2 px-4">
        <p className="font-medium text-slate-700">表示対象の機器がありません</p>
        <p className="text-xs leading-relaxed">
          メンテナンスマスタ（メーカー・型式）が登録された機器が対象です。
          <br />
          マスタ未登録の場合は「メンテナンスマスタ」で型式を登録し、必要なら「初期計画（月均等）」で次回予定日を設定してください。
        </p>
        <Link href="/maintenance/master" className="text-blue-600 underline text-xs">
          メンテナンスマスタへ
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="inline-flex gap-2 min-w-full align-top">
        {columns.map((col) => (
          <div
            key={col.key}
            className="flex flex-col w-[7.25rem] min-w-[7.25rem] shrink-0"
          >
            <div
              className={cn(
                'text-center rounded-t-lg border px-1 py-2',
                col.headerClass ?? 'bg-slate-100 text-slate-800 border-slate-200',
              )}
            >
              <p className="text-sm font-bold leading-none">{col.title}</p>
              <p className="text-[10px] mt-0.5 opacity-80 tabular-nums">
                {col.items.length}件
              </p>
            </div>
            <div className="flex-1 min-h-[10rem] max-h-[70vh] overflow-y-auto rounded-b-lg border border-t-0 border-slate-200 bg-white p-1.5 space-y-1">
              {col.items.length === 0 ? (
                <p className="text-[10px] text-slate-300 text-center py-4">—</p>
              ) : (
                col.items.map((item) => <PlanChip key={item.deviceId} item={item} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AnnualMaintenancePage() {
  const supabase = useMemo(() => createClient(), [])
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [hospitalFilter, setHospitalFilter] = useState('all')
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AnnualPlanItem[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchPlan = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const [devRes, recRes, masRes, hospRes] = await Promise.all([
      supabase
        .from('devices')
        .select('*')
        .not('status', 'eq', 'disposed')
        .not('status', 'eq', 'inactive')
        .order('barcode'),
      supabase
        .from('maintenance_records')
        .select('device_id, completed_date')
        .eq('type', '定期点検')
        .not('completed_date', 'is', null),
      supabase.from('maintenance_model_masters').select('*'),
      supabase.from('hospitals').select('*').order('name'),
    ])

    if (devRes.error || masRes.error) {
      const msg = devRes.error?.message ?? masRes.error?.message ?? 'データ取得エラー'
      setFetchError(msg)
      setItems([])
      setLoading(false)
      return
    }

    if (!hospRes.error) {
      setHospitals((hospRes.data as Hospital[]) ?? [])
    }
    const devicesRaw = devRes.data
    const records = recRes.data
    const mastersRaw = masRes.data

    const masters = (mastersRaw ?? []).map((row) =>
      mapMaintenanceModelMasterRow(row as Record<string, unknown>),
    )

    const latestByDevice = new Map<string, string>()
    const completedInYear = new Set<string>()
    for (const row of records ?? []) {
      const did = row.device_id as string | null
      const cd = (row.completed_date as string | null)?.slice(0, 10)
      if (!did || !cd) continue
      const prev = latestByDevice.get(did)
      if (!prev || cd > prev) latestByDevice.set(did, cd)
      if (cd >= yearStart && cd <= yearEnd) completedInYear.add(did)
    }

    let devices = (devicesRaw ?? []) as Device[]
    if (hospitalFilter !== 'all') {
      devices = devices.filter((d) => d.hospital_id === hospitalFilter)
    }

    const planItems = buildAnnualPlanItems(
      devices,
      masters,
      latestByDevice,
      completedInYear,
      year,
    )
    setItems(planItems)
    setLoading(false)
  }, [supabase, year, hospitalFilter])

  useEffect(() => {
    void fetchPlan()
  }, [fetchPlan])

  useEffect(() => {
    const channel = supabase
      .channel('annual-maintenance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => void fetchPlan())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_records' },
        () => void fetchPlan(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchPlan])

  const summary = useMemo(() => summarizeAnnualPlan(items), [items])
  const { overdue, months, unscheduled } = useMemo(
    () => groupPlanByMonth(items, year),
    [items, year],
  )

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="p-6 max-w-[100vw] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarRange className="h-7 w-7 text-blue-600" />
            年間メンテナンス計画
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {year}年の定期点検予定を月別の横一覧で表示します（ME No. をクリックで点検画面へ）。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={hospitalFilter} onValueChange={(v) => setHospitalFilter(v ?? 'all')}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="拠点" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての拠点</SelectItem>
              {hospitals.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void fetchPlan()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500">対象機器</p>
            <p className="text-2xl font-bold text-slate-800">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              {year}年 点検完了
            </p>
            <p className="text-2xl font-bold text-green-700">{summary.completed}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              期限超過
            </p>
            <p className="text-2xl font-bold text-red-700">{summary.overdue}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500">予定未設定</p>
            <p className="text-2xl font-bold text-slate-600">{summary.unscheduled}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded border bg-green-50 border-green-200" /> 完了
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded border bg-red-50 border-red-200" /> 期限超過
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded border bg-amber-50 border-amber-200" /> 今月予定
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded border bg-blue-50 border-blue-100" /> 予定
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-3 sm:p-4">
            {fetchError ? (
              <p className="text-sm text-red-600 py-8 text-center">{fetchError}</p>
            ) : (
              <AnnualPlanBoard
                overdue={overdue}
                months={months}
                unscheduled={unscheduled}
                year={year}
                totalPlanItems={items.length}
              />
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-400">
        横にスクロールして全月を表示できます。翌年予定の機器は12月列に表示します。
        次回予定は台帳の「次回点検予定」を優先します（未設定時は直近点検＋点検期間）。
      </p>
    </div>
  )
}
