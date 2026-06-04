'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Device, Hospital, MaintenanceModelMaster } from '@/lib/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { format, parse } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { parseChecklistItems } from '@/lib/maintenance-master'
import {
  buildAnnualPlanItems,
  groupPlanByMonth,
  summarizeAnnualPlan,
  type AnnualPlanItem,
  type AnnualPlanStatus,
} from '@/lib/annual-maintenance-plan'

function mapMasterRow(r: Record<string, unknown>): MaintenanceModelMaster {
  return {
    id: r.id as string,
    manufacturer: (r.manufacturer as string) ?? '',
    model: (r.model as string) ?? '',
    checklist_items: parseChecklistItems(r.checklist_items),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

const STATUS_LABEL: Record<AnnualPlanStatus, string> = {
  completed: '年内完了',
  overdue: '期限超過',
  due_this_month: '今月予定',
  scheduled: '予定',
  unscheduled: '予定未設定',
}

const STATUS_BADGE: Record<AnnualPlanStatus, string> = {
  completed: 'bg-green-100 text-green-800 border-0',
  overdue: 'bg-red-100 text-red-800 border-0',
  due_this_month: 'bg-amber-100 text-amber-900 border-0',
  scheduled: 'bg-blue-50 text-blue-800 border-0',
  unscheduled: 'bg-slate-100 text-slate-600 border-0',
}

function PlanItemRow({ item }: { item: AnnualPlanItem }) {
  const dateLabel = item.plannedDate
    ? format(parse(item.plannedDate, 'yyyy-MM-dd', new Date()), 'M月d日', { locale: ja })
    : '—'

  return (
    <TableRow>
      <TableCell className="font-medium text-slate-800">{item.name}</TableCell>
      <TableCell className="text-slate-600 text-sm">{item.barcode ?? '—'}</TableCell>
      <TableCell className="text-slate-600 text-sm">
        {[item.manufacturer, item.model].filter(Boolean).join(' ') || '—'}
      </TableCell>
      <TableCell className="text-slate-600 text-sm">{item.department ?? '—'}</TableCell>
      <TableCell className="text-slate-600 text-sm">{dateLabel}</TableCell>
      <TableCell>
        <Badge className={STATUS_BADGE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <Link
          href="/maintenance"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs')}
        >
          点検へ
        </Link>
      </TableCell>
    </TableRow>
  )
}

function MonthSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? count > 0)

  return (
    <Card className="border-0 shadow-sm">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 rounded-t-lg transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
          <span className="font-semibold text-slate-800">{title}</span>
          <Badge variant="secondary" className="font-normal">
            {count} 件
          </Badge>
        </div>
      </button>
      {open && count > 0 && <CardContent className="pt-0 pb-4 px-0">{children}</CardContent>}
      {open && count === 0 && (
        <CardContent className="pt-0 pb-4">
          <p className="text-sm text-slate-400 px-4">該当する機器はありません</p>
        </CardContent>
      )}
    </Card>
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

  const fetchPlan = useCallback(async () => {
    setLoading(true)
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const [{ data: devicesRaw }, { data: records }, { data: mastersRaw }, { data: hospitalsRaw }] =
      await Promise.all([
        supabase
          .from('devices')
          .select('*, hospitals(name)')
          .eq('status', 'active')
          .order('name'),
        supabase
          .from('maintenance_records')
          .select('device_id, completed_date')
          .eq('type', '定期点検')
          .not('completed_date', 'is', null),
        supabase.from('maintenance_model_masters').select('*'),
        supabase.from('hospitals').select('*').order('name'),
      ])

    setHospitals((hospitalsRaw as Hospital[]) ?? [])

    const masters = (mastersRaw ?? []).map((row) => mapMasterRow(row as Record<string, unknown>))

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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarRange className="h-7 w-7 text-blue-600" />
            年間メンテナンス計画
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            メンテナンスマスタが設定された稼働中機器の、{year}年の定期点検予定を月別に表示します。
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

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {overdue.length > 0 && (
            <Card className="border-red-200 bg-red-50/50 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-red-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  期限超過・要対応（{overdue.length}件）
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <PlanTable items={overdue} />
              </CardContent>
            </Card>
          )}

          {months.map((group) => (
            <MonthSection
              key={group.month}
              title={`${year}年 ${group.label}`}
              count={group.items.length}
              defaultOpen={group.month === new Date().getMonth() + 1}
            >
              <PlanTable items={group.items} />
            </MonthSection>
          ))}

          {unscheduled.length > 0 && (
            <MonthSection title="予定日未設定" count={unscheduled.length} defaultOpen={false}>
              <PlanTable items={unscheduled} />
            </MonthSection>
          )}
        </div>
      )}

      <p className="text-xs text-slate-400">
        次回予定日は機器台帳の「次回点検予定」、未入力の場合は直近の定期点検完了日から1年後を表示します。
        対象はメンテナンスマスタに点検項目が登録された稼働中機器のみです。
      </p>
    </div>
  )
}

function PlanTable({ items }: { items: AnnualPlanItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>機器名</TableHead>
          <TableHead>バーコード</TableHead>
          <TableHead>メーカー・型式</TableHead>
          <TableHead>部署</TableHead>
          <TableHead>予定日</TableHead>
          <TableHead>状態</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <PlanItemRow key={item.deviceId} item={item} />
        ))}
      </TableBody>
    </Table>
  )
}
