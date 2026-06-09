'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MaintenanceRecord, ChecklistResultEntry } from '@/lib/types'
import { logAuditEvent } from '@/lib/audit-log'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { MaintenanceChecklistRowInput } from '@/components/maintenance-checklist-row-input'
import {
  parseChecklistItems,
  parseChecklistResultsFromDb,
  defaultResultsForItems,
  applyBulkOk,
  legacyItemsIncomplete,
  serializeResultsForDb,
} from '@/lib/maintenance-master'
import {
  nextDueFromCompletedDate,
  normalizeIntervalMonths,
  DEFAULT_INSPECTION_INTERVAL_MONTHS,
} from '@/lib/inspection-interval'

interface Props {
  record: MaintenanceRecord | null
  open: boolean
  onClose: () => void
  onUpdated: () => void
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function MaintenanceRecordEditDialog({ record, open, onClose, onUpdated }: Props) {
  const supabase = createClient()
  const [completedDate, setCompletedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [checklistResults, setChecklistResults] = useState<Record<string, ChecklistResultEntry>>({})
  const [templateItems, setTemplateItems] = useState(
    [] as ReturnType<typeof parseChecklistItems>,
  )
  const [masterLoading, setMasterLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !record) return
    const rec = record

    setCompletedDate(toDateInputValue(rec.completed_date))
    setNotes(rec.notes?.trim() ?? '')

    async function loadMaster() {
      setMasterLoading(true)
      try {
        let rawItems = rec.maintenance_model_masters?.checklist_items
        if (!rawItems && rec.maintenance_model_master_id) {
          const { data } = await supabase
            .from('maintenance_model_masters')
            .select('checklist_items')
            .eq('id', rec.maintenance_model_master_id)
            .maybeSingle()
          rawItems = data?.checklist_items
        }

        const items = parseChecklistItems(rawItems ?? [])
        setTemplateItems(items)

        const parsed = parseChecklistResultsFromDb(rec.checklist_results ?? {})
        const defaults = defaultResultsForItems(items)
        setChecklistResults({ ...defaults, ...parsed })
      } finally {
        setMasterLoading(false)
      }
    }

    void loadMaster()
  }, [open, record, supabase])

  const hasBulkTargets = useMemo(
    () => templateItems.some((i) => i.kind === 'checkbox' || i.kind === 'yn'),
    [templateItems],
  )

  const deviceName = (record?.devices as { name?: string; barcode?: string } | undefined)?.name ?? '機器'
  const deviceBarcode = (record?.devices as { barcode?: string } | undefined)?.barcode

  async function refreshDeviceNextDueFromLatestPeriodic(deviceId: string) {
    const { data: latest } = await supabase
      .from('maintenance_records')
      .select('id, completed_date, maintenance_model_master_id')
      .eq('device_id', deviceId)
      .eq('type', '定期点検')
      .not('completed_date', 'is', null)
      .order('completed_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latest?.completed_date) return

    let intervalMonths = DEFAULT_INSPECTION_INTERVAL_MONTHS
    if (latest.maintenance_model_master_id) {
      const { data: master } = await supabase
        .from('maintenance_model_masters')
        .select('inspection_interval_months')
        .eq('id', latest.maintenance_model_master_id)
        .maybeSingle()
      intervalMonths = normalizeIntervalMonths(master?.inspection_interval_months)
    }

    const nextDue = nextDueFromCompletedDate(latest.completed_date, intervalMonths)
    await supabase
      .from('devices')
      .update({
        next_maintenance_due: nextDue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deviceId)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!record) return

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
      const checklist_results =
        templateItems.length > 0 ? serializeResultsForDb(checklistResults) : record.checklist_results

      const { error } = await supabase
        .from('maintenance_records')
        .update({
          completed_date: completedDate,
          notes: notes.trim() || null,
          checklist_results,
        })
        .eq('id', record.id)

      if (error) {
        alert(`保存に失敗しました: ${error.message}`)
        return
      }

      if (record.type === '定期点検') {
        await refreshDeviceNextDueFromLatestPeriodic(record.device_id)
      }

      void logAuditEvent(supabase, {
        action: 'update',
        entityType: 'maintenance_record',
        entityId: record.id,
        summary: `点検記録を編集（${deviceName}）`,
        metadata: { completed_date: completedDate, type: record.type },
      })

      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>点検記録を編集</DialogTitle>
        </DialogHeader>

        {record && (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{deviceName}</span>
                {deviceBarcode && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {deviceBarcode}
                  </Badge>
                )}
                <Badge variant="secondary">{record.type}</Badge>
              </div>
            </div>

            {masterLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                点検項目を読み込み中...
              </div>
            ) : templateItems.length > 0 ? (
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
            ) : (
              <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-100">
                点検項目マスタがないため、実施日と備考のみ編集できます。
              </p>
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

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                キャンセル
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                保存
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
