'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { MaintenanceChecklistItem } from '@/lib/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, ClipboardList, ArrowLeft, Layers, FileStack } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  normalizeModelKeyPart,
  parseChecklistItems,
  serializeChecklistTemplate,
  cloneChecklistItemsFromTemplate,
} from '@/lib/maintenance-master'
import {
  INSPECTION_INTERVAL_OPTIONS,
  normalizeIntervalMonths,
  DEFAULT_INSPECTION_INTERVAL_MONTHS,
} from '@/lib/inspection-interval'
import { MaintenanceChecklistItemsEditor } from '@/components/maintenance-checklist-items-editor'
import {
  filterDevicesForInitialPlan,
  buildEvenMonthlyDueDates,
  summarizeDueDatesByMonth,
  type DeviceForInitialPlan,
} from '@/lib/initial-maintenance-plan'

type Pair = { manufacturer: string; model: string }

type TemplateRow = { id: string; name: string; checklist_items: unknown }

function pairKey(p: Pair): string {
  return `${normalizeModelKeyPart(p.manufacturer)}|${normalizeModelKeyPart(p.model)}`
}

function mergePairs(
  devices: { manufacturer: string | null; model: string | null }[],
  masters: { manufacturer: string; model: string }[],
): Pair[] {
  const map = new Map<string, Pair>()
  for (const d of devices) {
    const m = (d.manufacturer ?? '').trim()
    const mo = (d.model ?? '').trim()
    if (!m || !mo) continue
    const p = { manufacturer: m, model: mo }
    map.set(pairKey(p), p)
  }
  for (const row of masters) {
    const m = (row.manufacturer ?? '').trim()
    const mo = (row.model ?? '').trim()
    if (!m || !mo) continue
    const p = { manufacturer: m, model: mo }
    map.set(pairKey(p), p)
  }
  return [...map.values()].sort((a, b) => {
    const c = a.manufacturer.localeCompare(b.manufacturer, 'ja')
    if (c !== 0) return c
    return a.model.localeCompare(b.model, 'ja')
  })
}

export default function MaintenanceMasterPage() {
  const supabase = useMemo(() => createClient(), [])
  const [devices, setDevices] = useState<{ manufacturer: string | null; model: string | null }[]>([])
  const [masterRows, setMasterRows] = useState<{ id: string; manufacturer: string; model: string }[]>([])
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [planningInitial, setPlanningInitial] = useState(false)

  const [selectedKey, setSelectedKey] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [masterId, setMasterId] = useState<string | null>(null)
  const [modelItems, setModelItems] = useState<MaintenanceChecklistItem[]>([])
  const [inspectionIntervalMonths, setInspectionIntervalMonths] = useState(
    DEFAULT_INSPECTION_INTERVAL_MONTHS,
  )
  const [maintenanceMethod, setMaintenanceMethod] = useState('')
  const [applyTemplateId, setApplyTemplateId] = useState('')

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateItems, setTemplateItems] = useState<MaintenanceChecklistItem[]>([])

  const pairs = useMemo(() => mergePairs(devices, masterRows), [devices, masterRows])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [{ data: devData }, { data: masData }, tplRes] = await Promise.all([
      supabase.from('devices').select('manufacturer, model'),
      supabase.from('maintenance_model_masters').select('id, manufacturer, model'),
      supabase.from('maintenance_checklist_templates').select('id, name, checklist_items').order('name'),
    ])
    setDevices((devData as { manufacturer: string | null; model: string | null }[]) ?? [])
    setMasterRows((masData as typeof masterRows) ?? [])
    if (tplRes.error) {
      console.error('[テンプレート]', tplRes.error.message)
      setTemplates([])
    } else {
      setTemplates((tplRes.data as TemplateRow[]) ?? [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const loadPairDetail = useCallback(
    async (p: Pair) => {
      const row = masterRows.find(
        (r) =>
          normalizeModelKeyPart(r.manufacturer) === normalizeModelKeyPart(p.manufacturer) &&
          normalizeModelKeyPart(r.model) === normalizeModelKeyPart(p.model),
      )
      if (row) {
        const { data } = await supabase
          .from('maintenance_model_masters')
          .select('checklist_items, inspection_interval_months, maintenance_method')
          .eq('id', row.id)
          .maybeSingle()
        setMasterId(row.id)
        setModelItems(parseChecklistItems(data?.checklist_items))
        setInspectionIntervalMonths(
          normalizeIntervalMonths(data?.inspection_interval_months),
        )
        setMaintenanceMethod(
          typeof data?.maintenance_method === 'string' ? data.maintenance_method : '',
        )
      } else {
        setMasterId(null)
        setModelItems([])
        setInspectionIntervalMonths(DEFAULT_INSPECTION_INTERVAL_MONTHS)
        setMaintenanceMethod('')
      }
      setApplyTemplateId('')
    },
    [supabase, masterRows],
  )

  useEffect(() => {
    if (!selectedKey) return
    const p = pairs.find((x) => pairKey(x) === selectedKey)
    if (!p) return
    setManufacturer(p.manufacturer)
    setModel(p.model)
    void loadPairDetail(p)
  }, [selectedKey, pairs, loadPairDetail])

  useEffect(() => {
    if (!selectedTemplateId || selectedTemplateId === '__new__') {
      if (selectedTemplateId === '__new__') {
        setTemplateName('')
        setTemplateItems([])
      }
      return
    }
    const row = templates.find((t) => t.id === selectedTemplateId)
    if (!row) return
    setTemplateName(row.name)
    setTemplateItems(parseChecklistItems(row.checklist_items))
  }, [selectedTemplateId, templates])

  function applyTemplateToModel() {
    if (!applyTemplateId) return
    const row = templates.find((t) => t.id === applyTemplateId)
    if (!row) return
    const parsed = parseChecklistItems(row.checklist_items)
    if (parsed.length === 0) {
      alert('選択したテンプレートに項目がありません。')
      return
    }
    if (
      modelItems.length > 0 &&
      !confirm(
        `テンプレート「${row.name}」の ${parsed.length} 項目で、現在の点検項目を置き換えますか？`,
      )
    ) {
      return
    }
    setModelItems(cloneChecklistItemsFromTemplate(parsed))
    setApplyTemplateId('')
  }

  const runInitialMaintenancePlan = useCallback(
    async (man: string, mod: string, options?: { askConfirm?: boolean }) => {
      const [{ data: devicesRaw }, { data: records }] = await Promise.all([
        supabase
          .from('devices')
          .select('id, barcode, name, manufacturer, model, status, next_maintenance_due')
          .eq('status', 'active'),
        supabase
          .from('maintenance_records')
          .select('device_id')
          .eq('type', '定期点検')
          .not('completed_date', 'is', null),
      ])

      const inspected = new Set<string>()
      for (const row of records ?? []) {
        const id = row.device_id as string | null
        if (id) inspected.add(id)
      }

      const targets = filterDevicesForInitialPlan(
        (devicesRaw ?? []) as DeviceForInitialPlan[],
        man,
        mod,
        inspected,
      )

      if (targets.length === 0) {
        if (options?.askConfirm !== false) {
          alert(
            '初期計画の対象がありません。\n（すでに次回点検予定がある、または定期点検の記録がある機器は対象外です）',
          )
        }
        return 0
      }

      const dueMap = buildEvenMonthlyDueDates(targets.map((t) => t.id))
      const monthSummary = summarizeDueDatesByMonth(dueMap)
        .filter((s) => s.count > 0)
        .map((s) => `${s.month}月 ${s.count}台`)
        .join(' / ')

      if (options?.askConfirm !== false) {
        const ok = confirm(
          `対象 ${targets.length} 台に、次回点検予定を月ごとに均等配分します（各月15日）。\n\n${monthSummary}\n\n※ 定期点検未実施かつ次回予定未設定の機器のみ。よろしいですか？`,
        )
        if (!ok) return 0
      }

      const updatedAt = new Date().toISOString()
      for (const [deviceId, dueDate] of dueMap) {
        const { error } = await supabase
          .from('devices')
          .update({ next_maintenance_due: dueDate, updated_at: updatedAt })
          .eq('id', deviceId)
        if (error) {
          alert(`初期計画の保存に失敗しました: ${error.message}`)
          return 0
        }
      }

      return targets.length
    },
    [supabase],
  )

  async function saveMaster() {
    const man = manufacturer.trim()
    const mod = model.trim()
    if (!man || !mod) {
      alert('メーカーと型式の両方を入力してください。')
      return
    }
    const checklist_items = serializeChecklistTemplate(modelItems)
    const isNewMaster = !masterId
    setSaving(true)
    try {
      if (masterId) {
        await supabase
          .from('maintenance_model_masters')
          .update({
            manufacturer: man,
            model: mod,
            checklist_items,
            maintenance_method: maintenanceMethod.trim() || null,
            inspection_interval_months: normalizeIntervalMonths(inspectionIntervalMonths),
            updated_at: new Date().toISOString(),
          })
          .eq('id', masterId)
      } else {
        const { data: row, error } = await supabase
          .from('maintenance_model_masters')
          .insert({
            manufacturer: man,
            model: mod,
            checklist_items,
            maintenance_method: maintenanceMethod.trim() || null,
            inspection_interval_months: normalizeIntervalMonths(inspectionIntervalMonths),
          })
          .select('id')
          .single()
        if (!error && row?.id) setMasterId(row.id as string)
      }
      await loadAll()
      setSelectedKey(pairKey({ manufacturer: man, model: mod }))

      if (isNewMaster) {
        const ok = confirm(
          'メンテナンスマスタを保存しました。\n\n同じ型式の機器に、初回のみ「月均等」の点検計画を組みますか？\n（未点検・次回予定なしの機器だけ対象）',
        )
        if (ok) {
          setPlanningInitial(true)
          try {
            const n = await runInitialMaintenancePlan(man, mod, { askConfirm: false })
            if (n > 0) {
              alert(`${n} 台に次回点検予定を設定しました。ダッシュボードの一括未実施表示が解消されます。`)
            }
          } finally {
            setPlanningInitial(false)
          }
        }
      } else {
        alert('メンテナンスマスタを保存しました。')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleInitialPlanClick() {
    const man = manufacturer.trim()
    const mod = model.trim()
    if (!man || !mod) {
      alert('メーカーと型式を入力してください。')
      return
    }
    if (!masterId) {
      alert('先に型式マスタを保存してください。')
      return
    }
    setPlanningInitial(true)
    try {
      const n = await runInitialMaintenancePlan(man, mod, { askConfirm: true })
      if (n > 0) {
        alert(`${n} 台に次回点検予定を設定しました。`)
      }
    } finally {
      setPlanningInitial(false)
    }
  }

  async function saveTemplate() {
    const name = templateName.trim()
    if (!name) {
      alert('テンプレート名（マスタ名）を入力してください。')
      return
    }
    const checklist_items = serializeChecklistTemplate(templateItems)
    setSavingTemplate(true)
    try {
      if (selectedTemplateId && selectedTemplateId !== '__new__') {
        const { error } = await supabase
          .from('maintenance_checklist_templates')
          .update({
            name,
            checklist_items,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedTemplateId)
        if (error) {
          alert(`保存に失敗しました: ${error.message}`)
          return
        }
      } else {
        const { data: row, error } = await supabase
          .from('maintenance_checklist_templates')
          .insert({ name, checklist_items })
          .select('id')
          .single()
        if (error) {
          alert(`保存に失敗しました: ${error.message}`)
          return
        }
        if (row?.id) setSelectedTemplateId(row.id as string)
      }
      await loadAll()
      alert('一括テンプレートを保存しました。')
    } finally {
      setSavingTemplate(false)
    }
  }

  async function deleteTemplate() {
    if (!selectedTemplateId || selectedTemplateId === '__new__') return
    const row = templates.find((t) => t.id === selectedTemplateId)
    if (!row) return
    if (!confirm(`テンプレート「${row.name}」を削除しますか？`)) return
    const { error } = await supabase
      .from('maintenance_checklist_templates')
      .delete()
      .eq('id', selectedTemplateId)
    if (error) {
      alert(`削除に失敗しました: ${error.message}`)
      return
    }
    setSelectedTemplateId('')
    setTemplateName('')
    setTemplateItems([])
    await loadAll()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/maintenance"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2')}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          定期点検へ
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ClipboardList className="h-7 w-7 text-blue-600" />
          メンテナンスマスタ
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          一括テンプレートを作成し、メーカー・型式ごとのマスタへ適用できます。登録内容は「定期点検」画面に反映されます。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          読み込み中…
        </div>
      ) : (
        <>
          {/* 一括テンプレート */}
          <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-semibold text-slate-800">一括テンプレート</h2>
            </div>
            <p className="text-sm text-slate-600">
              マスタ名を付けて点検項目を登録します。下の「型式マスタ」で型式を選んだあと、テンプレートから項目を読み込めます。
            </p>

            <div className="space-y-2">
              <Label>テンプレートを選択</Label>
              <Select
                value={selectedTemplateId || '__none__'}
                onValueChange={(v) => {
                  if (v === '__none__') {
                    setSelectedTemplateId('')
                    setTemplateName('')
                    setTemplateItems([])
                    return
                  }
                  setSelectedTemplateId(v ?? '')
                }}
              >
                <SelectTrigger className="bg-white max-w-xl">
                  <SelectValue placeholder="選択または新規作成" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">（未選択）</SelectItem>
                  <SelectItem value="__new__">＋ 新規テンプレート</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}（{parseChecklistItems(t.checklist_items).length}項目）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(selectedTemplateId === '__new__' || selectedTemplateId) && (
              <div className="space-y-4 rounded-lg border border-violet-100 bg-white p-4">
                <div className="space-y-1.5">
                  <Label>マスタ名（テンプレート名） *</Label>
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="例: シリンジポンプ共通点検"
                    className="bg-white max-w-md"
                  />
                </div>
                <MaintenanceChecklistItemsEditor
                  items={templateItems}
                  onChange={setTemplateItems}
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" onClick={saveTemplate} disabled={savingTemplate}>
                    {savingTemplate && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    テンプレートを保存
                  </Button>
                  {selectedTemplateId && selectedTemplateId !== '__new__' && (
                    <Button type="button" variant="outline" onClick={deleteTemplate}>
                      削除
                    </Button>
                  )}
                </div>
              </div>
            )}

            {templates.length === 0 && !selectedTemplateId && (
              <p className="text-sm text-slate-500">
                テンプレートがありません。「＋ 新規テンプレート」から作成してください。
              </p>
            )}
          </div>

          {/* 型式マスタ */}
          <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <FileStack className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">メーカー・型式マスタ</h2>
            </div>

            <div className="space-y-2">
              <Label>台帳・マスタから型式を選択</Label>
              <Select
                value={selectedKey || '__manual__'}
                onValueChange={(v) => {
                  if (v === '__manual__') {
                    setSelectedKey('')
                    setManufacturer('')
                    setModel('')
                    setMasterId(null)
                    setModelItems([])
                    setInspectionIntervalMonths(DEFAULT_INSPECTION_INTERVAL_MONTHS)
                    setApplyTemplateId('')
                    return
                  }
                  setSelectedKey(v ?? '')
                }}
              >
                <SelectTrigger className="bg-white max-w-xl">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__manual__">手入力でメーカー・型式を指定…</SelectItem>
                  {pairs.map((p) => (
                    <SelectItem key={pairKey(p)} value={pairKey(p)}>
                      {p.manufacturer} — {p.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>製造元メーカー</Label>
                <Input
                  value={manufacturer}
                  onChange={(e) => {
                    setManufacturer(e.target.value)
                    setSelectedKey('')
                  }}
                  placeholder="例: TERUMO"
                  className="bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label>型式</Label>
                <Input
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value)
                    setSelectedKey('')
                  }}
                  placeholder="例: TE-332S"
                  className="bg-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>メンテナンス方法（この型式）</Label>
              <Textarea
                value={maintenanceMethod}
                onChange={(e) => setMaintenanceMethod(e.target.value)}
                placeholder="点検手順、清掃方法、注意事項、参照マニュアルなど"
                rows={6}
                className="bg-white text-sm min-h-[120px]"
              />
              <p className="text-xs text-slate-500">
                定期点検画面で参照できます。点検項目とは別に、作業手順や注意点を記載してください。
              </p>
            </div>

            <div className="space-y-1.5 max-w-md">
              <Label>点検期間（この型式の定期点検サイクル）</Label>
              <Select
                value={String(inspectionIntervalMonths)}
                onValueChange={(v) =>
                  setInspectionIntervalMonths(normalizeIntervalMonths(Number(v)))
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSPECTION_INTERVAL_OPTIONS.map((o) => (
                    <SelectItem key={o.months} value={String(o.months)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                ダッシュボードの未実施判定・次回点検予定・年間計画に反映されます。
              </p>
            </div>

            {templates.length > 0 && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg bg-blue-50/80 border border-blue-100 p-3">
                <div className="space-y-1.5 flex-1 min-w-[12rem]">
                  <Label className="text-blue-800">一括テンプレートから読み込む</Label>
                  <Select
                    value={applyTemplateId || '__none__'}
                    onValueChange={(v) => setApplyTemplateId(v === '__none__' ? '' : (v ?? ''))}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="テンプレートを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">選択してください</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!applyTemplateId}
                  onClick={applyTemplateToModel}
                >
                  項目を適用
                </Button>
              </div>
            )}

            <div className="border-t border-slate-100 pt-4">
              <MaintenanceChecklistItemsEditor
                items={modelItems}
                onChange={setModelItems}
                emptyMessage="項目がありません。テンプレートから読み込むか、項目を追加してください。"
              />
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 space-y-2">
                <p className="text-sm text-emerald-900 font-medium">初回の点検計画（月均等）</p>
                <p className="text-xs text-emerald-800/90 leading-relaxed">
                  マスタ作成直後は全機器が「未実施」に見えることがあります。対象機器（未点検・次回予定なし）に、当年の1月〜12月へ均等に次回点検予定日を設定します。2回目以降は点検記録に従い自動更新されます。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-white border-emerald-200 text-emerald-900 hover:bg-emerald-50"
                  disabled={planningInitial || saving || !masterId}
                  onClick={() => void handleInitialPlanClick()}
                >
                  {planningInitial && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  初期計画を組む（月均等）
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" onClick={saveMaster} disabled={saving || planningInitial}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  型式マスタを保存
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-slate-500">
        ※ テーブル未作成で保存エラーになる場合は SQL Editor で{' '}
        <code className="text-[11px] bg-slate-100 px-1 rounded">migration_checklist_templates.sql</code>
        {' / '}
        <code className="text-[11px] bg-slate-100 px-1 rounded">migration_inspection_interval.sql</code>
        を実行してください。
      </p>
    </div>
  )
}
