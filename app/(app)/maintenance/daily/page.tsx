'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  Device,
  MaintenanceRecord,
  MaintenanceModelMaster,
  ChecklistResultEntry,
} from '@/lib/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Barcode, Loader2, ClipboardList, Stethoscope, RefreshCw, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  matchMasterForDevice,
  defaultResultsForItems,
  applyBulkOk,
  legacyItemsIncomplete,
  serializeResultsForDb,
  summarizeMaintenanceChecklistRaw,
  describeMaintenanceChecklistLines,
  mapMaintenanceModelMasterRow,
} from '@/lib/maintenance-master'
import {
  DAILY_INSPECTION_RECORD_TYPE,
  itemsDueForDailyInspection,
} from '@/lib/daily-inspection'
import { MaintenanceChecklistRowInput } from '@/components/maintenance-checklist-row-input'
import { DeviceRepairHistory } from '@/components/devices/device-repair-history'

function DailyMaintenancePageContent() {
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const [codeInput, setCodeInput] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [device, setDevice] = useState<Device | null>(null)
  const [masters, setMasters] = useState<MaintenanceModelMaster[]>([])
  const [recentRecords, setRecentRecords] = useState<MaintenanceRecord[]>([])
  const [checklistResults, setChecklistResults] = useState<Record<string, ChecklistResultEntry>>({})
  const [completedDate, setCompletedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [masterReloading, setMasterReloading] = useState(false)

  const fetchMasters = useCallback(async (): Promise<MaintenanceModelMaster[]> => {
    const { data, error } = await supabase.from('maintenance_model_masters').select('*')
    if (error) {
      console.error('[日常点検] メンテナンスマスタ取得エラー:', error.message)
      return []
    }
    const list = (data ?? []).map((row) => mapMaintenanceModelMasterRow(row as Record<string, unknown>))
    setMasters(list)
    return list
  }, [supabase])

  useEffect(() => {
    void fetchMasters()
  }, [fetchMasters])

  const masterForDevice = device
    ? matchMasterForDevice(masters, device.manufacturer, device.model, 'daily')
    : null

  const templateItems = useMemo(
    () => itemsDueForDailyInspection(masterForDevice?.checklist_items ?? []),
    [masterForDevice],
  )

  useEffect(() => {
    if (!device) {
      setChecklistResults({})
      return
    }
    setChecklistResults(defaultResultsForItems(templateItems))
  }, [device, templateItems])

  const loadRecentForDevice = useCallback(
    async (deviceId: string) => {
      const { data } = await supabase
        .from('maintenance_records')
        .select('*, maintenance_model_masters(checklist_items)')
        .eq('device_id', deviceId)
        .eq('type', DAILY_INSPECTION_RECORD_TYPE)
        .order('completed_date', { ascending: false })
        .limit(8)
      setRecentRecords((data as MaintenanceRecord[]) ?? [])
    },
    [supabase],
  )

  useEffect(() => {
    if (device?.id) loadRecentForDevice(device.id)
    else setRecentRecords([])
  }, [device, loadRecentForDevice])

  async function reloadMastersManual() {
    setMasterReloading(true)
    try {
      await fetchMasters()
    } finally {
      setMasterReloading(false)
    }
  }

  const applyLoadedDevice = useCallback(
    async (data: Device) => {
      await fetchMasters()
      setDevice(data)
      setCompletedDate(format(new Date(), 'yyyy-MM-dd'))
      setNotes('')
    },
    [fetchMasters],
  )

  const loadDeviceFromQuery = useCallback(
    async (opts: { barcode?: string; deviceId?: string }) => {
      setLookupBusy(true)
      try {
        if (opts.deviceId) {
          const { data, error } = await supabase
            .from('devices')
            .select('*')
            .eq('id', opts.deviceId)
            .maybeSingle()
          if (error || !data) {
            setDevice(null)
            alert('指定された機器が見つかりませんでした。')
            return
          }
          await applyLoadedDevice(data as Device)
          return
        }
        const raw = opts.barcode?.trim()
        if (!raw) return
        const { data, error } = await supabase.from('devices').select('*').eq('barcode', raw).maybeSingle()
        if (error || !data) {
          setDevice(null)
          alert(`機器コード「${raw}」に一致する機器が見つかりませんでした。`)
          return
        }
        await applyLoadedDevice(data as Device)
      } finally {
        setLookupBusy(false)
      }
    },
    [supabase, applyLoadedDevice],
  )

  useEffect(() => {
    const deviceId = searchParams.get('device')
    const barcode = searchParams.get('barcode')
    if (!deviceId && !barcode) return
    if (deviceId && device?.id === deviceId) return
    if (barcode?.trim() && device?.barcode?.trim() === barcode.trim()) return
    void loadDeviceFromQuery({
      deviceId: deviceId ?? undefined,
      barcode: barcode ?? undefined,
    })
  }, [searchParams, device?.id, device?.barcode, loadDeviceFromQuery])

  async function lookupByCode() {
    const raw = codeInput.trim()
    if (!raw) return
    setLookupBusy(true)
    try {
      const { data, error } = await supabase.from('devices').select('*').eq('barcode', raw).maybeSingle()
      if (error || !data) {
        setDevice(null)
        alert(`機器コード「${raw}」に一致する機器が見つかりませんでした。`)
        return
      }
      await applyLoadedDevice(data as Device)
    } finally {
      setLookupBusy(false)
      setCodeInput('')
    }
  }

  function clearDevice() {
    setDevice(null)
    setRecentRecords([])
    setChecklistResults({})
  }

  async function submitInspection(e: React.FormEvent) {
    e.preventDefault()
    if (!device) return
    const missLegacy = legacyItemsIncomplete(templateItems, checklistResults)
    if (missLegacy.length > 0) {
      alert(
        `「適／不適／対象外」の項目が未入力です（${missLegacy.length}件）。すべて選択してください。`,
      )
      return
    }
    if (!completedDate) {
      alert('実施日を入力してください。')
      return
    }

    setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const checklist_results =
        templateItems.length > 0 ? serializeResultsForDb(checklistResults) : null

      await supabase.from('maintenance_records').insert({
        device_id: device.id,
        type: DAILY_INSPECTION_RECORD_TYPE,
        scheduled_date: null,
        completed_date: completedDate,
        result: null,
        notes: notes.trim() || null,
        maintenance_model_master_id: masterForDevice?.id ?? null,
        checklist_results,
        created_by: user?.id ?? null,
      })

      await loadRecentForDevice(device.id)
      alert('日常点検を記録しました。')
      setNotes('')
      const freshMasters = await fetchMasters()
      const m = matchMasterForDevice(
        freshMasters,
        device.manufacturer,
        device.model,
        'daily',
      )
      setChecklistResults(
        defaultResultsForItems(itemsDueForDailyInspection(m?.checklist_items ?? [])),
      )
    } finally {
      setSaving(false)
    }
  }

  const hasBulkTargets = templateItems.some((i) => i.kind === 'checkbox' || i.kind === 'yn')
  const todayLabel = format(new Date(), 'yyyy年M月d日（E）', { locale: ja })

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 mb-2')}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            ダッシュボードへ
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">日常点検</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            本日（{todayLabel}）実施する日常点検を記録します。
          </p>
        </div>
        <Link
          href="/maintenance/master"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <ClipboardList className="h-4 w-4 mr-1.5" />
          メンテナンスマスタ
        </Link>
      </div>

      <Card className="border-0 shadow-sm bg-teal-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-teal-800 font-medium text-sm flex items-center gap-2">
                <Barcode className="h-4 w-4" />
                機器コード（管理バーコード）
              </Label>
              <Input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    lookupByCode()
                  }
                }}
                placeholder="読み取りまたは入力して Enter"
                className="bg-white border-teal-200"
                disabled={lookupBusy}
                autoFocus
              />
            </div>
            <Button type="button" className="sm:mb-0.5" onClick={lookupByCode} disabled={lookupBusy || !codeInput.trim()}>
              {lookupBusy ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Barcode className="h-4 w-4 mr-2" />
              )}
              読み取り
            </Button>
          </div>
        </CardContent>
      </Card>

      {!device ? (
        <Card className="border border-dashed border-slate-200 bg-white">
          <CardContent className="py-16 text-center text-slate-400">
            <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-35" />
            <p className="text-sm">機器コードを読み取ると、本日の日常点検フォームが表示されます。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-teal-600" />
                機器カルテ
              </CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={clearDevice}>
                別の機器
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="outline" className="font-mono">
                  {device.barcode ?? 'コードなし'}
                </Badge>
              </div>
              <dl className="grid grid-cols-1 gap-2">
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500 shrink-0">機器名</dt>
                  <dd className="font-medium text-right">{device.name}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500 shrink-0">メーカー / 型式</dt>
                  <dd className="text-right">
                    {[device.manufacturer, device.model].filter(Boolean).join(' / ') || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500 shrink-0">設置</dt>
                  <dd className="text-right">
                    {[device.department, device.location].filter(Boolean).join(' ') || '—'}
                  </dd>
                </div>
              </dl>
              {masterForDevice?.maintenance_method && (
                <div className="rounded-lg bg-teal-50 border border-teal-100 p-3 text-slate-800">
                  <p className="text-xs font-medium text-teal-800 mb-1">メンテナンス方法（日常点検マスタ）</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {masterForDevice.maintenance_method}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">修理履歴</p>
                <DeviceRepairHistory deviceId={device.id} />
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">直近の日常点検記録</p>
                {recentRecords.length === 0 ? (
                  <p className="text-xs text-slate-400">まだ記録がありません</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs w-28">実施日</TableHead>
                        <TableHead className="text-xs">点検内容</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentRecords.map((rec) => {
                        const lines = describeMaintenanceChecklistLines(
                          rec.checklist_results ?? {},
                          rec.maintenance_model_masters?.checklist_items,
                        )
                        const fallback =
                          summarizeMaintenanceChecklistRaw(rec.checklist_results ?? undefined)
                        return (
                          <TableRow key={rec.id}>
                            <TableCell className="text-xs align-top">
                              {rec.completed_date
                                ? format(new Date(rec.completed_date), 'yyyy/MM/dd', { locale: ja })
                                : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 max-w-[14rem]">
                              {lines.length > 0 ? (
                                <ul className="list-none space-y-0.5 max-h-24 overflow-y-auto">
                                  {lines.slice(0, 8).map((line, i) => (
                                    <li key={i} className="leading-snug">
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              ) : fallback ? (
                                fallback
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm border-t-4 border-t-teal-600">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">本日の日常点検</CardTitle>
              <p className="text-xs text-slate-500 font-normal">
                マスタで「毎日」に設定された項目のみ表示します。
              </p>
            </CardHeader>
            <CardContent>
              {!masterForDevice ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4 space-y-2">
                  <p className="font-medium">この機器に対応する日常点検マスタが見つかりません。</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={masterReloading}
                      onClick={() => void reloadMastersManual()}
                    >
                      {masterReloading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      マスタを再取得
                    </Button>
                    <Link
                      href="/maintenance/master"
                      className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-8 text-xs')}
                    >
                      日常点検マスタを設定
                    </Link>
                  </div>
                </div>
              ) : templateItems.length === 0 ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
                  <p>日常点検マスタはありますが、「毎日」の点検項目がありません。</p>
                </div>
              ) : null}

              <form onSubmit={submitInspection} className="space-y-4">
                {masterForDevice && templateItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-xs text-slate-600">点検項目（{templateItems.length}件）</Label>
                      {hasBulkTargets && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() =>
                            setChecklistResults((prev) => applyBulkOk(templateItems, prev))
                          }
                        >
                          一括OK
                        </Button>
                      )}
                    </div>
                    <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
                      {templateItems.map((item) => (
                        <div key={item.key} className="flex flex-col gap-2 p-3">
                          <span className="text-sm font-medium text-slate-800">{item.label}</span>
                          <MaintenanceChecklistRowInput
                            item={item}
                            entry={checklistResults[item.key]}
                            onChange={(next) =>
                              setChecklistResults((prev) => ({ ...prev, [item.key]: next }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 max-w-xs">
                  <Label>実施日</Label>
                  <Input
                    type="date"
                    value={completedDate}
                    onChange={(e) => setCompletedDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>備考</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="追加メモがあれば入力"
                  />
                </div>

                <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  日常点検を記録する
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default function DailyMaintenancePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          読み込み中…
        </div>
      }
    >
      <DailyMaintenancePageContent />
    </Suspense>
  )
}
