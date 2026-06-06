'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Request,
  RECEPTION_ASSESSMENT_LABEL,
  REPAIR_ROUTE_LABEL,
  getStatusList,
  REQUEST_TYPE_LABEL,
} from '@/lib/types'
import {
  advanceRequiresCompletionFields,
  advanceRequiresRepairNotes,
  buildInHouseLogNotes,
  isInHouseRepair,
  syncDeviceStatusForRepair,
} from '@/lib/repair-request'
import { logAuditEvent } from '@/lib/audit-log'
import { formatRequestEquipmentWithMeNo, getRequestMeNo } from '@/lib/request-display'
import {
  coerceEstimateAmount,
  estimatesAmountEqual,
  formatYen,
  parseEstimateInput,
} from '@/lib/estimate-amount'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Loader2, History, Trash2 } from 'lucide-react'
import { RequestStatusHistory } from '@/components/requests/request-status-history'
import { fetchRequestLogs, mergeRegistrationNotes } from '@/lib/request-logs'

interface Props {
  request: Request
  open: boolean
  onClose: () => void
  onUpdated: () => void
}

export function StatusUpdateDialog({ request, open, onClose, onUpdated }: Props) {
  const supabase = createClient()
  const [newStatus, setNewStatus] = useState(request.status)
  const [notes, setNotes] = useState('')
  const [repairContent, setRepairContent] = useState('')
  const [replacementParts, setReplacementParts] = useState('')
  const [estimateAmount, setEstimateAmount] = useState('')
  const [handledByName, setHandledByName] = useState('')
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof fetchRequestLogs>>>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const statusList = getStatusList(request.type, request.repair_route)
  const inHouse = isInHouseRepair(request)

  useEffect(() => {
    if (!open) return
    setNewStatus(request.status)
    setNotes('')
    setRepairContent(request.repair_content?.trim() ?? '')
    setReplacementParts(request.replacement_parts?.trim() ?? '')
    const stored = coerceEstimateAmount(request.estimate_amount)
    setEstimateAmount(stored !== null ? String(Math.round(stored)) : '')
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setHandledByName('')
        return
      }
      supabase.from('profiles').select('name').eq('id', user.id).maybeSingle().then(({ data }) => {
        setHandledByName(data?.name?.trim() ? data.name : '')
      })
    })
    void fetchRequestLogs(supabase, request.id).then((rows) => {
      setLogs(mergeRegistrationNotes(rows, request.notes))
    })
  }, [open, request.id, request.status, request.estimate_amount, request.notes, request.repair_content, request.replacement_parts, supabase])

  const parsedEstimate = parseEstimateInput(estimateAmount)
  const atEstimateStatus = newStatus === '見積受取'
  const storedEstimate = coerceEstimateAmount(request.estimate_amount)
  const statusChanged = newStatus !== request.status

  const estimateOk =
    !atEstimateStatus || (parsedEstimate !== null && parsedEstimate >= 0)

  const amountOnlyUpdate =
    !statusChanged &&
    atEstimateStatus &&
    parsedEstimate !== null &&
    parsedEstimate >= 0 &&
    !estimatesAmountEqual(parsedEstimate, storedEstimate)

  const handledOk = handledByName.trim().length > 0

  const needsRepairNotes = statusChanged && advanceRequiresRepairNotes(request, newStatus)
  const needsCompletionFields = statusChanged && advanceRequiresCompletionFields(request, newStatus)

  const inHouseFieldsOk =
    (!needsRepairNotes || notes.trim().length > 0) &&
    (!needsCompletionFields || (repairContent.trim().length > 0 && replacementParts.trim().length > 0))

  const canUpdate =
    handledOk &&
    estimateOk &&
    inHouseFieldsOk &&
    (statusChanged || amountOnlyUpdate)

  async function handleUpdate() {
    if (!canUpdate) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const actor = handledByName.trim()

      if (statusChanged) {
        let logNotes = buildInHouseLogNotes(newStatus, notes, repairContent, replacementParts)
        if (newStatus === '見積受取' && parsedEstimate !== null) {
          const extra = `見積金額 ${formatYen(parsedEstimate)}`
          logNotes = logNotes ? `${extra}／${logNotes}` : extra
        }
        const { error: logError } = await supabase.from('request_logs').insert({
          request_id: request.id,
          from_status: request.status,
          to_status: newStatus,
          changed_by: user?.id ?? null,
          handled_by_name: actor,
          notes: logNotes,
        })
        if (logError) {
          console.error('[依頼] 履歴登録エラー:', logError)
          alert(`履歴の記録に失敗しました: ${logError.message}`)
          return
        }

        const updatePayload: {
          status: string
          updated_at: string
          estimate_amount?: number | null
          repair_content?: string | null
          replacement_parts?: string | null
        } = {
          status: newStatus,
          updated_at: new Date().toISOString(),
        }
        if (newStatus === '見積受取' && parsedEstimate !== null) {
          updatePayload.estimate_amount = parsedEstimate
        }
        if (needsCompletionFields) {
          updatePayload.repair_content = repairContent.trim()
          updatePayload.replacement_parts = replacementParts.trim()
        }
        const { error: updateError } = await supabase
          .from('requests')
          .update(updatePayload)
          .eq('id', request.id)
        if (updateError) {
          console.error('[依頼] ステータス更新エラー:', updateError)
          alert(`ステータス更新に失敗しました: ${updateError.message}`)
          return
        }

        const deviceError = await syncDeviceStatusForRepair(
          supabase,
          request.device_id,
          request.reception_assessment,
          newStatus,
          request.repair_route,
        )
        if (deviceError) {
          alert(`ステータスは更新されましたが、機器ステータスの更新に失敗しました: ${deviceError}`)
        }

        void logAuditEvent(supabase, {
          action: 'status_change',
          entityType: 'request',
          entityId: request.id,
          summary: `${REQUEST_TYPE_LABEL[request.type]}: ${request.status} → ${newStatus}`,
          metadata: { from: request.status, to: newStatus },
        })
      } else if (amountOnlyUpdate && parsedEstimate !== null) {
        const prev =
          storedEstimate !== null ? formatYen(storedEstimate) : '（未登録）'
        const next = formatYen(parsedEstimate)
        const noteParts = [`見積金額を ${prev} → ${next} に更新`, notes.trim()].filter(Boolean)
        const { error: logError } = await supabase.from('request_logs').insert({
          request_id: request.id,
          from_status: request.status,
          to_status: request.status,
          changed_by: user?.id ?? null,
          handled_by_name: actor,
          notes: noteParts.join('／') || null,
        })
        if (logError) {
          console.error('[依頼] 履歴登録エラー:', logError)
          alert(`履歴の記録に失敗しました: ${logError.message}`)
          return
        }
        const { error: updateError } = await supabase
          .from('requests')
          .update({
            estimate_amount: parsedEstimate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.id)
        if (updateError) {
          console.error('[依頼] 見積更新エラー:', updateError)
          alert(`見積金額の更新に失敗しました: ${updateError.message}`)
          return
        }

        void logAuditEvent(supabase, {
          action: 'update',
          entityType: 'request',
          entityId: request.id,
          summary: `${REQUEST_TYPE_LABEL[request.type]}: 見積金額を更新`,
          metadata: { estimate_amount: parsedEstimate },
        })
      }

      const freshLogs = await fetchRequestLogs(supabase, request.id)
      setLogs(mergeRegistrationNotes(freshLogs, request.notes))
      onUpdated()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        'この依頼を削除しますか？\n変更履歴もまとめて削除されます。取り消せません。',
      )
    ) {
      return
    }
    setDeleting(true)
    try {
      const { error } = await supabase.from('requests').delete().eq('id', request.id)
      if (error) {
        alert('削除に失敗しました。')
        return
      }
      void logAuditEvent(supabase, {
        action: 'delete',
        entityType: 'request',
        entityId: request.id,
        summary: `${REQUEST_TYPE_LABEL[request.type]}を削除（${request.requested_equipment ?? request.description.slice(0, 30)}）`,
      })
      onUpdated()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>依頼詳細・ステータス更新</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{REQUEST_TYPE_LABEL[request.type]}</Badge>
              {inHouse && (
                <Badge variant="outline">{REPAIR_ROUTE_LABEL.in_house}</Badge>
              )}
              <Badge>{request.status}</Badge>
            </div>
            <p className="font-medium text-slate-800">{request.description}</p>
            <div className="text-slate-500 space-y-1">
              {request.reception_ce_name && (
                <p className="text-slate-700 font-medium">受付CE: {request.reception_ce_name}</p>
              )}
              {inHouse && request.reception_assessment && (
                <p className="text-slate-700">
                  受付判定: {RECEPTION_ASSESSMENT_LABEL[request.reception_assessment]}
                </p>
              )}
              {request.type === 'repair' && (
                <>
                  {getRequestMeNo(request) && (
                    <p className="text-slate-700 font-mono">
                      ME No. {getRequestMeNo(request)}
                    </p>
                  )}
                  <p>依頼機器: {formatRequestEquipmentWithMeNo(request)}</p>
                </>
              )}
              {request.type !== 'repair' && (() => {
                const eq =
                  (request.devices as { name?: string } | undefined)?.name?.trim() ||
                  request.requested_equipment?.trim()
                return eq ? <p>依頼機器: {eq}</p> : null
              })()}
              <p>依頼者: {request.requester_name}{request.requester_dept ? ` (${request.requester_dept})` : ''}</p>
              <p>登録日時: {format(new Date(request.created_at), 'yyyy年M月d日 HH:mm', { locale: ja })}</p>
              {storedEstimate !== null && (
                <p className="text-slate-700 font-medium">
                  登録済み見積金額: {formatYen(storedEstimate)}
                </p>
              )}
              {request.repair_content && (
                <p className="text-slate-700">修理内容: {request.repair_content}</p>
              )}
              {request.replacement_parts && (
                <p className="text-slate-700">交換パーツ: {request.replacement_parts}</p>
              )}
              {request.notes && <p className="text-xs text-slate-400">備考: {request.notes}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="handled-by">進行担当者（記名）*</Label>
            <Input
              id="handled-by"
              value={handledByName}
              onChange={(e) => setHandledByName(e.target.value)}
              placeholder="この操作を行ったCEの氏名"
            />
            <p className="text-xs text-slate-500">
              ステータスを進める／見積金額を更新するときは必ず入力してください。履歴に記録されます。
            </p>
            {!handledOk && (statusChanged || amountOnlyUpdate) && (
              <p className="text-xs text-red-600">進行担当者（記名）を入力してください。</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>ステータスを更新</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v ?? request.status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusList.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {atEstimateStatus && !inHouse && (
            <div className="space-y-1.5">
              <Label htmlFor="estimate-amount">
                見積金額（円）{statusChanged && newStatus === '見積受取' ? ' *' : ''}
              </Label>
              <Input
                id="estimate-amount"
                inputMode="numeric"
                autoComplete="off"
                placeholder="例: 120000"
                value={estimateAmount}
                onChange={(e) => setEstimateAmount(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                「見積受取」に変更する場合は必ず入力してください。既に見積受取のときは金額の修正のみも保存できます。
              </p>
              {!estimateOk && (
                <p className="text-xs text-red-600">0以上の数値を入力してください。</p>
              )}
            </div>
          )}

          {needsCompletionFields && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="repair-content">修理内容 *</Label>
                <Textarea
                  id="repair-content"
                  value={repairContent}
                  onChange={(e) => setRepairContent(e.target.value)}
                  placeholder="実施した修理内容を入力"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="replacement-parts">交換パーツ *</Label>
                <Textarea
                  id="replacement-parts"
                  value={replacementParts}
                  onChange={(e) => setReplacementParts(e.target.value)}
                  placeholder="交換した部品名・型番など（なければ「なし」）"
                  rows={2}
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="log-notes">
              {needsRepairNotes ? '備考 *' : '備考（任意）'}
            </Label>
            <Textarea
              id="log-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                needsRepairNotes
                  ? '修理中の作業内容・連絡事項など'
                  : 'このステップの補足・連絡事項など'
              }
              rows={3}
            />
            <p className="text-xs text-slate-500">入力した内容は進行履歴に記録されます。</p>
            {needsRepairNotes && !notes.trim() && statusChanged && (
              <p className="text-xs text-red-600">備考を入力してください。</p>
            )}
          </div>

          {logs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <History className="h-4 w-4" />
                進行履歴
              </div>
              <RequestStatusHistory
                logs={logs}
                editable={request.type === 'repair'}
                maxHeight="max-h-64"
                onLogsChange={() => {
                  void fetchRequestLogs(supabase, request.id).then((rows) => {
                    setLogs(mergeRegistrationNotes(rows, request.notes))
                  })
                }}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-0">
          <Button
            type="button"
            variant="destructive"
            className="sm:mr-auto"
            disabled={loading || deleting}
            onClick={handleDelete}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            依頼を削除
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={deleting}>
              閉じる
            </Button>
            <Button type="button" onClick={handleUpdate} disabled={loading || deleting || !canUpdate}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              更新する
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
