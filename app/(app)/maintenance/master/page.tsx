'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { MaintenanceChecklistItem, MaintenanceChecklistItemKind } from '@/lib/types'
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
import { Loader2, Trash2, ClipboardList, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  normalizeModelKeyPart,
  generateChecklistItemKey,
  parseChecklistItems,
  serializeChecklistTemplate,
  CHECKLIST_KIND_LABEL,
} from '@/lib/maintenance-master'

type Pair = { manufacturer: string; model: string }

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

const ADDABLE_KINDS: MaintenanceChecklistItemKind[] = [
  'checkbox',
  'number',
  'yn',
  'date',
  'text',
  'remarks',
  'legacy_okng',
]

export default function MaintenanceMasterPage() {
  const supabase = useMemo(() => createClient(), [])
  const [devices, setDevices] = useState<{ manufacturer: string | null; model: string | null }[]>([])
  const [masterRows, setMasterRows] = useState<{ id: string; manufacturer: string; model: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [selectedKey, setSelectedKey] = useState<string>('')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [masterId, setMasterId] = useState<string | null>(null)
  const [items, setItems] = useState<MaintenanceChecklistItem[]>([])

  const pairs = useMemo(() => mergePairs(devices, masterRows), [devices, masterRows])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [{ data: devData }, { data: masData }] = await Promise.all([
      supabase.from('devices').select('manufacturer, model'),
      supabase.from('maintenance_model_masters').select('id, manufacturer, model'),
    ])
    setDevices((devData as { manufacturer: string | null; model: string | null }[]) ?? [])
    setMasterRows((masData as typeof masterRows) ?? [])
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
        setItems(parseChecklistItems(data?.checklist_items))
      } else {
        setMasterId(null)
        setItems([])
      }
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

  async function saveMaster() {
    const man = manufacturer.trim()
    const mod = model.trim()
    if (!man || !mod) {
      alert('メーカーと型式の両方を入力してください。')
      return
    }
    const checklist_items = serializeChecklistTemplate(items)
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

  function addItem(kind: MaintenanceChecklistItemKind) {
    setItems((prev) => [
      ...prev,
      {
        key: generateChecklistItemKey(),
        label: '',
        kind,
        ...(kind === 'number' ? { unit: '' } : {}),
      },
    ])
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }

  function updateItem(key: string, patch: Partial<MaintenanceChecklistItem>) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i
        const next = { ...i, ...patch }
        if (next.kind !== 'number') {
          const { unit: _, ...rest } = next
          return rest as MaintenanceChecklistItem
        }
        return next
      }),
    )
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
          メーカーと型式ごとに定期点検の項目テンプレートを登録します。登録した内容は、同一型式の機器で「定期点検」画面に自動で反映されます。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          読み込み中…
        </div>
      ) : (
        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
                  setItems([])
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

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-base">点検項目テンプレート</Label>
              <div className="flex flex-wrap gap-2">
                <Select
                  onValueChange={(v) => {
                    if (v && ADDABLE_KINDS.includes(v as MaintenanceChecklistItemKind)) {
                      addItem(v as MaintenanceChecklistItemKind)
                    }
                  }}
                >
                  <SelectTrigger className="w-[220px] h-9 bg-white text-sm">
                    <SelectValue placeholder="項目の種類を選んで追加" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADDABLE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        追加: {CHECKLIST_KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">
                項目がありません。上のメニューから種類を選んで追加してください。
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((row, idx) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:flex-row sm:items-start"
                  >
                    <span className="text-xs text-slate-400 shrink-0 pt-2 w-6">{idx + 1}.</span>
                    <div className="flex-1 grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">点検名</span>
                        <Input
                          value={row.label}
                          onChange={(e) => updateItem(row.key, { label: e.target.value })}
                          placeholder="点検内容の名称"
                          className="bg-white text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">入力タイプ</span>
                        <Select
                          value={row.kind}
                          onValueChange={(v) =>
                            updateItem(row.key, {
                              kind: v as MaintenanceChecklistItemKind,
                              ...(v !== 'number' ? { unit: undefined } : { unit: row.unit ?? '' }),
                            })
                          }
                        >
                          <SelectTrigger className="bg-white text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ADDABLE_KINDS.map((k) => (
                              <SelectItem key={k} value={k}>
                                {CHECKLIST_KIND_LABEL[k]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {row.kind === 'number' && (
                        <div className="space-y-1 sm:col-span-2">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400">単位</span>
                          <Input
                            value={row.unit ?? ''}
                            onChange={(e) => updateItem(row.key, { unit: e.target.value })}
                            placeholder="例: V、℃、h"
                            className="bg-white text-sm max-w-xs"
                          />
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-9 w-9 p-0 text-slate-400 hover:text-red-600 self-end sm:self-start"
                      onClick={() => removeItem(row.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" onClick={saveMaster} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                マスタを保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
