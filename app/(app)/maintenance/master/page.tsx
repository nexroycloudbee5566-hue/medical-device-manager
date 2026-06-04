'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { MaintenanceChecklistItem } from '@/lib/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { MaintenanceChecklistItemsEditor } from '@/components/maintenance-checklist-items-editor'

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

  const [selectedKey, setSelectedKey] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [masterId, setMasterId] = useState<string | null>(null)
  const [modelItems, setModelItems] = useState<MaintenanceChecklistItem[]>([])
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
          .select('checklist_items')
          .eq('id', row.id)
          .maybeSingle()
        setMasterId(row.id)
        setModelItems(parseChecklistItems(data?.checklist_items))
      } else {
        setMasterId(null)
        setModelItems([])
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

  async function saveMaster() {
    const man = manufacturer.trim()
    const mod = model.trim()
    if (!man || !mod) {
      alert('メーカーと型式の両方を入力してください。')
      return
    }
    const checklist_items = serializeChecklistTemplate(modelItems)
    setSaving(true)
    try {
      if (masterId) {
        await supabase
          .from('maintenance_model_masters')
          .update({
            manufacturer: man,
            model: mod,
            checklist_items,
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
          })
          .select('id')
          .single()
        if (!error && row?.id) setMasterId(row.id as string)
      }
      await loadAll()
      setSelectedKey(pairKey({ manufacturer: man, model: mod }))
      alert('メンテナンスマスタを保存しました。')
    } finally {
      setSaving(false)
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
              <div className="flex flex-wrap gap-2 pt-4">
                <Button type="button" onClick={saveMaster} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  型式マスタを保存
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-slate-500">
        ※ 初回利用時にテンプレート保存でエラーになる場合は、Supabase SQL Editor で{' '}
        <code className="text-[11px] bg-slate-100 px-1 rounded">supabase/migration_checklist_templates.sql</code>{' '}
        を実行してください。
      </p>
    </div>
  )
}
