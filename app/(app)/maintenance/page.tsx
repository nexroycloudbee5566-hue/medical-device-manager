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
import { logAuditEvent } from '@/lib/audit-log'
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
import { Barcode, Loader2, ClipboardList, Stethoscope, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, isPast } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  matchMasterForDevice,
  parseChecklistItems,
  defaultResultsForItems,
  applyBulkOk,
  legacyItemsIncomplete,
  serializeResultsForDb,
  summarizeMaintenanceChecklistRaw,
  describeMaintenanceChecklistLines,
  mapMaintenanceModelMasterRow,
} from '@/lib/maintenance-master'
import {
  nextDueFromCompletedDate,
  intervalMonthsLabel,
} from '@/lib/inspection-interval'
import { MaintenanceChecklistRowInput } from '@/components/maintenance-checklist-row-input'
import { DeviceRepairHistory } from '@/components/devices/device-repair-history'

function MaintenancePageContent() {
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
  const [dueEdit, setDueEdit] = useState('')
  const [dueSaving, setDueSaving] = useState(false)

  const fetchMasters = useCallback(async (): Promise<MaintenanceModelMaster[]> => {
    const { data, error } = await supabase.from('maintenance_model_masters').select('*')
    if (error) {
      console.error('[定期点検] メンテナンスマスタ取得エラー:', error.message)
      return []
    }
    const list = (data ?? []).map((row) => mapMaintenanceModelMasterRow(row as Record<string, unknown>))
    setMasters(list)
    return list
  }, [supabase])

  useEffect(() => {
    void fetchMasters()
  }, [fetchMasters])

  useEffect(() => {
    if (device?.id) void fetchMasters()
  }, [device?.id, fetchMasters])

  const masterForDevice = device
    ? matchMasterForDevice(masters, device.manufacturer, device.model, 'periodic')
    : null

  useEffect(() => {
    if (!device) {
      setChecklistResults({})
      return
    }
    const m = matchMasterForDevice(masters, device.manufacturer, device.model, 'periodic')
    setChecklistResults(defaultResultsForItems(m?.checklist_items ?? []))
  }, [device, masters])

  const loadRecentForDevice = useCallback(
    async (deviceId: string) => {
      const { data } = await supabase
        .from('maintenance_records')
        .select('*, maintenance_model_masters(checklist_items)')
        .eq('device_id', deviceId)
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

  useEffect(() => {
    setDueEdit(device?.next_maintenance_due?.slice(0, 10) ?? '')
  }, [device?.id, device?.next_maintenance_due])

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
    setDueEdit('')
  }

  async function saveNextMaintenanceDue(clear = false) {
    if (!device) return
    const nextValue = clear ? null : dueEdit.trim() || null
    if (!clear && nextValue && !/^\d{4}-\d{2}-\d{2}$/.test(nextValue)) {
      alert('次回点検予定の日付形式が正しくありません。')
      return
    }
    setDueSaving(true)
    try {
      const { data, error } = await supabase
        .from('devices')
        .update({
          next_maintenance_due: nextValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', device.id)
        .select('*')
        .maybeSingle()
      if (error) {
        alert(`次回点検予定の保存に失敗しました: ${error.message}`)
        return
      }
      if (data) {
        setDevice(data as Device)
        setDueEdit(nextValue ?? '')
      }
    } finally {
      setDueSaving(false)
    }
  }

  async function submitInspection(e: React.FormEvent) {
    e.preventDefault()
    if (!device) return
    const items = masterForDevice?.checklist_items ?? []
    const missLegacy = legacyItemsIncomplete(items, checklistResults)
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
        items.length > 0 ? serializeResultsForDb(checklistResults) : null

      await supabase.from('maintenance_records').insert({
        device_id: device.id,
        type: '定期点検',
        scheduled_date: null,
        completed_date: completedDate,
        result: null,
        notes: notes.trim() || null,
        maintenance_model_master_id: masterForDevice?.id ?? null,
        checklist_results,
        created_by: user?.id ?? null,
      })

      const intervalMonths = masterForDevice?.inspection_interval_months ?? 12
      const nextDue = nextDueFromCompletedDate(completedDate, intervalMonths)
      await supabase
        .from('devices')
        .update({
          next_maintenance_due: nextDue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', device.id)

      const { data: refreshed } = await supabase.from('devices').select('*').eq('id', device.id).maybeSingle()
      let deviceAfterSave = device
      if (refreshed) {
        deviceAfterSave = refreshed as Device
        setDevice(deviceAfterSave)
      }

      void logAuditEvent(supabase, {
        action: 'create',
        entityType: 'maintenance_record',
        entityId: device.id,
        summary: `定期点検を記録（${device.barcode ?? device.name}）`,
        metadata: { completed_date: completedDate },
      })

      await loadRecentForDevice(device.id)
      alert(
        `定期点検を記録しました。次回点検予定は ${intervalMonthsLabel(intervalMonths)} 後（${nextDue.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')}）に更新されています。`,
      )
      setNotes('')
      const freshMasters = await fetchMasters()
      const m = matchMasterForDevice(
        freshMasters,
        deviceAfterSave.manufacturer,
        deviceAfterSave.model,
        'periodic',
      )
      setChecklistResults(defaultResultsForItems(m?.checklist_items ?? []))
    } finally {
      setSaving(false)
    }
  }

  const maintenanceDue = device?.next_maintenance_due ? new Date(device.next_maintenance_due) : null
  const overdue =
    maintenanceDue != null && !Number.isNaN(maintenanceDue.getTime()) && isPast(maintenanceDue)

  const templateItems = masterForDevice?.checklist_items ?? []
  const hasBulkTargets = templateItems.some((i) => i.kind === 'checkbox' || i.kind === 'yn')

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">定期点検（読み取り）</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            機器コードを手入力またはバーコードで読み取り、対象機器のカルテと定期点検を記録します（次回予定は型式マスタの点検期間に従います）。
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

      <Card className="border-0 shadow-sm bg-blue-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-blue-800 font-medium text-sm flex items-center gap-2">
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
                className="bg-white border-blue-200"
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
            <p className="text-sm">機器コードを読み取ると、カルテと点検フォームが表示されます。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-blue-600" />
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
                <Badge
                  className={
                    device.status === 'active'
                      ? 'bg-green-100 text-green-800 border-0'
                      : device.status === 'repair'
                        ? 'bg-orange-100 text-orange-800 border-0'
                        : 'bg-slate-100 text-slate-700 border-0'
                  }
                >
                  {device.status === 'active' ? '稼働中' : device.status === 'repair' ? '修理中' : '休止中'}
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
                  <dt className="text-slate-500 shrink-0">シリアル</dt>
                  <dd className="text-right">{device.serial_number ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500 shrink-0">設置</dt>
                  <dd className="text-right">
                    {[device.department, device.location].filter(Boolean).join(' ') || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500 shrink-0">購入日</dt>
                  <dd className="text-right">
                    {device.purchase_date
                      ? format(new Date(device.purchase_date), 'yyyy/MM/dd', { locale: ja })
                      : '—'}
                  </dd>
                </div>
                {masterForDevice && (
                  <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                    <dt className="text-slate-500 shrink-0">点検期間（型式マスタ）</dt>
                    <dd className="text-right font-medium">
                      {intervalMonthsLabel(masterForDevice.inspection_interval_months)}
                    </dd>
                  </div>
                )}
                <div className="border-b border-slate-100 pb-3 space-y-2">
                  <div className="flex justify-between gap-4 items-center">
                    <dt className="text-slate-500 shrink-0">次回点検予定</dt>
                    {maintenanceDue && (
                      <dd className="text-right text-xs">
                        <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                          {overdue ? '期限切れ' : '予定あり'}
                        </span>
                      </dd>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <Input
                      type="date"
                      className="h-9 text-sm bg-white flex-1"
                      value={dueEdit}
                      onChange={(e) => setDueEdit(e.target.value)}
                      disabled={dueSaving}
                    />
                    <div className="flex gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={dueSaving || dueEdit === (device.next_maintenance_due?.slice(0, 10) ?? '')}
                        onClick={() => void saveNextMaintenanceDue()}
                      >
                        {dueSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '保存'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={dueSaving || !device.next_maintenance_due}
                        onClick={() => void saveNextMaintenanceDue(true)}
                      >
                        クリア
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    手動で変更できます。点検記録登録時は型式マスタの点検期間から自動更新されます。
                  </p>
                </div>
              </dl>
              {masterForDevice?.maintenance_method && (
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-slate-800">
                  <p className="text-xs font-medium text-indigo-800 mb-1">メンテナンス方法（型式マスタ）</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {masterForDevice.maintenance_method}
                  </p>
                </div>
              )}

              {device.notes && (
                <div className="rounded-lg bg-slate-50 p-3 text-slate-700">
                  <p className="text-xs font-medium text-slate-500 mb-1">備考（台帳）</p>
                  <p className="whitespace-pre-wrap">{device.notes}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">修理履歴</p>
                <DeviceRepairHistory deviceId={device.id} meNo={device.barcode} />
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">直近の点検記録</p>
                {recentRecords.length === 0 ? (
                  <p className="text-xs text-slate-400">まだ記録がありません</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs w-28">実施日</TableHead>
                        <TableHead className="text-xs">点検内容（項目別）</TableHead>
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
                                ? format(new Date(rec.completed_date), 'yyyy/MM/dd', {
                                    locale: ja,
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 max-w-[14rem]">
                              {lines.length > 0 ? (
                                <ul className="list-none space-y-0.5 max-h-24 overflow-y-auto">
                                  {lines.slice(0, 12).map((line, i) => (
                                    <li key={i} className="leading-snug">
                                      {line}
                                    </li>
                                  ))}
                                  {lines.length > 12 && (
                                    <li className="text-slate-400">ほか {lines.length - 12} 件…</li>
                                  )}
                                </ul>
                              ) : fallback ? (
                                fallback
                              ) : rec.notes?.trim() ? (
                                <span className="text-slate-500">備考のみ</span>
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

          <Card className="border-0 shadow-sm border-t-4 border-t-blue-600">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">定期点検</CardTitle>
              <p className="text-xs text-slate-500 font-normal">
                記録後、次回点検予定日は型式マスタの点検期間
                {masterForDevice
                  ? `（${intervalMonthsLabel(masterForDevice.inspection_interval_months)}）`
                  : ''}
                後に自動更新されます。
              </p>
            </CardHeader>
            <CardContent>
              {!masterForDevice ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4 space-y-2">
                  <p className="font-medium">この機器に対応するメンテナンスマスタが見つかりません。</p>
                  <p className="text-xs leading-relaxed">
                    台帳のメーカー: <strong>{device.manufacturer?.trim() || '（未入力）'}</strong>
                    {' / '}
                    型式: <strong>{device.model?.trim() || '（未入力）'}</strong>
                  </p>
                  <p className="text-xs text-amber-900/90">
                    メンテナンスマスタはメーカー・型式の組み合わせで紐づきます。台帳の値とマスタが一致しているか確認してください。
                    型式だけが一致するマスタが1件のときは自動で使われます。
                  </p>
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
                      マスタ設定を開く
                    </Link>
                  </div>
                </div>
              ) : templateItems.length === 0 ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4 space-y-2">
                  <p>マスタはありますが、点検項目が空です（点検名が未入力の行は保存されません）。</p>
                  <Link
                    href="/maintenance/master"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 text-xs inline-flex')}
                  >
                    マスタで項目を追加する
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mb-3">
                  マスタの入力タイプに沿って記録します。Y/N・チェック項目は「一括OK」でまとめて入力できます。
                </p>
              )}

              <form onSubmit={submitInspection} className="space-y-4">
                {masterForDevice && templateItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-xs text-slate-600">点検項目</Label>
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
                          一括OK（Y/N→Y、チェック→オン）
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
                  <Label>備考（点検記録全体）</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="追加メモがあれば入力"
                  />
                </div>

                <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  点検を記録する
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default function MaintenancePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 max-w-6xl mx-auto flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          読み込み中...
        </div>
      }
    >
      <MaintenancePageContent />
    </Suspense>
  )
}
