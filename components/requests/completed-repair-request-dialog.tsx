'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Request,
  REPAIR_ROUTE_LABEL,
  ReceptionAssessment,
  REQUEST_TYPE_LABEL,
} from '@/lib/types'
import { fetchRequestLogs, mergeRegistrationNotes } from '@/lib/request-logs'
import { RequestStatusHistory } from '@/components/requests/request-status-history'
import { Button } from '@/components/ui/button'
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
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { History, Loader2 } from 'lucide-react'
import { isInHouseRepair, syncDeviceStatusForRepair } from '@/lib/repair-request'
import {
  COMPLETION_ASSESSMENT_LABEL,
  CompletionAssessmentSelector,
} from '@/components/requests/completion-assessment-selector'
import { formatRequestEquipmentWithMeNo, getRequestMeNo } from '@/lib/request-display'

interface Props {
  request: Request | null
  open: boolean
  onClose: () => void
  onUpdated: () => void
}

export function CompletedRepairRequestDialog({ request, open, onClose, onUpdated }: Props) {
  const supabase = createClient()
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [repairContent, setRepairContent] = useState('')
  const [replacementParts, setReplacementParts] = useState('')
  const [completionAssessment, setCompletionAssessment] = useState<ReceptionAssessment>('repair')
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof fetchRequestLogs>>>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !request) return
    setDescription(request.description)
    setNotes(request.notes?.trim() ?? '')
    setRepairContent(request.repair_content?.trim() ?? '')
    setReplacementParts(request.replacement_parts?.trim() ?? '')
    setCompletionAssessment(request.reception_assessment ?? 'repair')
    void fetchRequestLogs(supabase, request.id).then((rows) => {
      setLogs(mergeRegistrationNotes(rows, request.notes))
    })
  }, [open, request, supabase])

  async function reloadLogs() {
    if (!request) return
    const rows = await fetchRequestLogs(supabase, request.id)
    setLogs(mergeRegistrationNotes(rows, request.notes))
  }

  async function handleSave() {
    if (!request) return
    const desc = description.trim()
    if (!desc) {
      alert('依頼内容を入力してください。')
      return
    }
    setSaving(true)
    try {
      const inHouseRepair = isInHouseRepair(request)
      const assessmentChanged =
        inHouseRepair && completionAssessment !== (request.reception_assessment ?? 'repair')

      const { error } = await supabase
        .from('requests')
        .update({
          description: desc,
          notes: notes.trim() || null,
          repair_content: repairContent.trim() || null,
          replacement_parts: replacementParts.trim() || null,
          ...(inHouseRepair ? { reception_assessment: completionAssessment } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) {
        alert(`保存に失敗しました: ${error.message}`)
        return
      }

      if (assessmentChanged && request.device_id) {
        const deviceError = await syncDeviceStatusForRepair(
          supabase,
          request.device_id,
          completionAssessment,
          '完了',
          request.repair_route,
        )
        if (deviceError) {
          alert(`保存されましたが、機器ステータスの更新に失敗しました: ${deviceError}`)
        }
      }

      onUpdated()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!request) return null

  const inHouse = isInHouseRepair(request)
  const meNo = getRequestMeNo(request)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>完了済み修理依頼 — 参照・編集</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{REQUEST_TYPE_LABEL.repair}</Badge>
              {request.repair_route && (
                <Badge variant="outline">{REPAIR_ROUTE_LABEL[request.repair_route]}</Badge>
              )}
              <Badge className="bg-green-100 text-green-800 border-0">完了</Badge>
            </div>
            {meNo && (
              <p className="text-slate-700 font-mono">ME No. {meNo}</p>
            )}
            <p className="text-slate-600">依頼機器: {formatRequestEquipmentWithMeNo(request)}</p>
            <p className="text-slate-600">
              依頼者: {request.requester_name}
              {request.requester_dept ? ` (${request.requester_dept})` : ''}
            </p>
            {request.reception_ce_name && (
              <p className="text-slate-600">受付CE: {request.reception_ce_name}</p>
            )}
            <p className="text-slate-500">
              完了日: {format(new Date(request.updated_at), 'yyyy年M月d日 HH:mm', { locale: ja })}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hist-description">依頼内容 *</Label>
            <Textarea
              id="hist-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hist-notes">備考</Label>
            <Textarea
              id="hist-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {inHouse && (
            <>
              <CompletionAssessmentSelector
                value={completionAssessment}
                onChange={setCompletionAssessment}
                required={false}
              />
              <div className="space-y-1.5">
                <Label htmlFor="hist-repair-content">修理内容</Label>
                <Textarea
                  id="hist-repair-content"
                  value={repairContent}
                  onChange={(e) => setRepairContent(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hist-replacement-parts">交換パーツ</Label>
                <Textarea
                  id="hist-replacement-parts"
                  value={replacementParts}
                  onChange={(e) => setReplacementParts(e.target.value)}
                  rows={2}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <History className="h-4 w-4" />
              進行履歴（編集可）
            </div>
            <RequestStatusHistory
              logs={logs}
              editable
              maxHeight="max-h-64"
              onLogsChange={() => void reloadLogs()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            閉じる
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
